/**
 * Google Drive API Service
 *
 * Allows uploading JSON database backups directly to the user's Google Drive.
 * Uses Google Identity Services (GIS) with both popup and redirect OAuth flows:
 *   - Desktop browsers: tries popup first, falls back to redirect if blocked
 *   - Mobile / installed PWA (standalone): always uses redirect flow
 */

import { getSettings, saveSettings } from '../db/database'
import { generateBackupData, getBackupFilename } from '../db/backupRestore'

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
          initCodeClient: (config: {
            client_id: string
            scope: string
            ux_mode: 'popup' | 'redirect'
            redirect_uri?: string
            callback?: (response: { code?: string; error?: string }) => void
          }) => {
            requestCode: () => void
          }
        }
      }
    }
  }
}

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_FOLDER_NAME = 'QuickSale_Backups'
const OAUTH_STATE_KEY = 'quick-sale-pos:oauth-pending-client-id'

let currentAccessToken: string | null = null
let tokenExpiresAt = 0

/**
 * Detect if the app is running as an installed PWA (standalone mode).
 */
function isStandalonePWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Detect if running on a mobile device.
 */
function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Dynamically load Google Identity Services client script if not already loaded.
 */
export async function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')))
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

/**
 * Exchange an authorization code for an access token using Google's token endpoint.
 * This is the standard OAuth2 authorization code exchange for public clients (no secret needed).
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string,
): Promise<{ access_token?: string; expires_in?: number; error?: string }> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return { error: data.error_description || data.error || `Token exchange failed (${response.status})` }
    }
    return { access_token: data.access_token, expires_in: data.expires_in }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Token exchange failed' }
  }
}

/**
 * Called once on app startup to handle the OAuth redirect callback.
 * If the URL contains a `?code=...` parameter, we exchange it for an access token and save it.
 */
export async function handleOAuthRedirectIfPresent(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')

  if (!code) return

  // Clean the URL immediately to avoid re-processing
  const cleanUrl = window.location.origin + window.location.pathname
  window.history.replaceState({}, '', cleanUrl)

  // Retrieve the client ID we saved before the redirect
  const clientId = sessionStorage.getItem(OAUTH_STATE_KEY) || localStorage.getItem(OAUTH_STATE_KEY)
  if (!clientId) {
    // Try to get from saved settings as a fallback
    try {
      const settings = await getSettings()
      const savedClientId = settings.googleDriveSettings?.clientId
      if (!savedClientId) {
        console.warn('[GoogleDrive] OAuth redirect received but no client ID found')
        return
      }
      await processAuthCode(code, savedClientId)
    } catch {
      console.warn('[GoogleDrive] Failed to process OAuth redirect')
    }
    return
  }

  // Clean up the stored state
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  localStorage.removeItem(OAUTH_STATE_KEY)

  await processAuthCode(code, clientId)
}

/**
 * Process an authorization code: exchange it for a token and persist.
 */
async function processAuthCode(code: string, clientId: string): Promise<void> {
  const redirectUri = window.location.origin + '/'

  const result = await exchangeCodeForToken(code, clientId, redirectUri)

  if (result.error || !result.access_token) {
    console.error('[GoogleDrive] Token exchange failed:', result.error)
    return
  }

  currentAccessToken = result.access_token
  const expiresIn = result.expires_in || 3599
  tokenExpiresAt = Date.now() + expiresIn * 1000

  // Persist to settings
  try {
    const settings = await getSettings()
    await saveSettings({
      ...settings,
      googleDriveSettings: {
        ...settings.googleDriveSettings,
        clientId: clientId.trim(),
        enabled: true,
        accessToken: currentAccessToken,
        tokenExpiry: tokenExpiresAt,
      },
    })
  } catch {
    // non-critical
  }
}

/**
 * Request an access token from Google.
 *
 * Strategy:
 * - Mobile / Standalone PWA → always use redirect flow (popup can't return to PWA)
 * - Desktop browser → try popup first; if popup is blocked or errors, fall back to redirect
 */
export async function authenticateGoogleDrive(clientId: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  if (!clientId || !clientId.trim()) {
    return { success: false, error: 'Google Client ID is required' }
  }

  await loadGsiScript()

  if (!window.google?.accounts?.oauth2) {
    return { success: false, error: 'Google Identity Services could not be initialized' }
  }

  const useRedirect = isStandalonePWA() || isMobileDevice()

  if (useRedirect) {
    return startRedirectFlow(clientId.trim())
  }

  // Desktop: try popup flow first
  return startPopupFlow(clientId.trim())
}

/**
 * Popup-based token flow (desktop browsers).
 * Falls back to redirect if popup is blocked.
 */
function startPopupFlow(clientId: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: async (response) => {
          if (response.error || !response.access_token) {
            resolve({ success: false, error: response.error || 'Authentication cancelled or failed' })
            return
          }

          currentAccessToken = response.access_token
          const expiresIn = response.expires_in || 3599
          tokenExpiresAt = Date.now() + expiresIn * 1000

          // Update saved settings
          try {
            const settings = await getSettings()
            await saveSettings({
              ...settings,
              googleDriveSettings: {
                ...settings.googleDriveSettings,
                clientId,
                enabled: true,
                accessToken: currentAccessToken,
                tokenExpiry: tokenExpiresAt,
              },
            })
          } catch {
            // non-critical
          }

          resolve({ success: true, accessToken: currentAccessToken })
        },
        error_callback: (error) => {
          // Popup blocked or closed — fall back to redirect
          if (error.type === 'popup_blocked' || error.type === 'popup_closed') {
            startRedirectFlow(clientId).then(resolve)
            return
          }
          resolve({ success: false, error: error.message || `Auth error: ${error.type}` })
        },
      })

      tokenClient.requestAccessToken({ prompt: 'consent' })
    } catch (err) {
      // If popup fails for any reason, fall back to redirect
      startRedirectFlow(clientId).then(resolve)
    }
  })
}

/**
 * Redirect-based code flow (mobile / PWA / popup fallback).
 * Navigates the current window to Google's consent screen.
 * After consent, Google redirects back with ?code=... which is handled by handleOAuthRedirectIfPresent().
 */
function startRedirectFlow(clientId: string): Promise<{ success: boolean; error?: string }> {
  // Save the client ID so we can retrieve it after the redirect
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, clientId)
  } catch {
    // sessionStorage may not be available in some PWA contexts
  }
  // Also save to localStorage as a more durable fallback
  try {
    localStorage.setItem(OAUTH_STATE_KEY, clientId)
  } catch {
    // non-critical
  }

  try {
    const redirectUri = window.location.origin + '/'

    const codeClient = window.google!.accounts!.oauth2!.initCodeClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      ux_mode: 'redirect',
      redirect_uri: redirectUri,
    })

    codeClient.requestCode()

    // The page will navigate away — this promise won't resolve
    return new Promise(() => {})
  } catch (err) {
    return Promise.resolve({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to start Google sign-in redirect',
    })
  }
}

/**
 * Disconnect Google Drive credentials.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  currentAccessToken = null
  tokenExpiresAt = 0
  const settings = await getSettings()
  if (settings.googleDriveSettings) {
    await saveSettings({
      ...settings,
      googleDriveSettings: {
        ...settings.googleDriveSettings,
        enabled: false,
        accessToken: undefined,
        tokenExpiry: undefined,
      },
    })
  }
}

/**
 * Get valid active access token, either from memory or saved settings.
 */
async function getValidAccessToken(): Promise<string | null> {
  if (currentAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return currentAccessToken
  }

  const settings = await getSettings()
  const gd = settings.googleDriveSettings
  if (gd?.accessToken && gd.tokenExpiry && Date.now() < gd.tokenExpiry - 60_000) {
    currentAccessToken = gd.accessToken
    tokenExpiresAt = gd.tokenExpiry
    return currentAccessToken
  }

  return null
}

/**
 * Find or create the 'QuickSale_Backups' folder on Google Drive.
 */
async function getOrCreateBackupFolder(accessToken: string): Promise<string | null> {
  try {
    // Search for existing folder
    const query = encodeURIComponent(`name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (searchRes.ok) {
      const data = await searchRes.json()
      if (data.files && data.files.length > 0) {
        return data.files[0].id
      }
    }

    // Create the folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })

    if (createRes.ok) {
      const created = await createRes.json()
      return created.id
    }

    return null
  } catch {
    return null
  }
}

/**
 * Upload current database backup to Google Drive.
 */
export async function uploadCurrentBackupToGoogleDrive(businessName: string): Promise<{
  success: boolean
  filename?: string
  fileId?: string
  error?: string
}> {
  let token = await getValidAccessToken()

  if (!token) {
    const settings = await getSettings()
    const clientId = settings.googleDriveSettings?.clientId
    if (!clientId) {
      return { success: false, error: 'Google Drive is not connected. Please enter your Google Client ID and connect.' }
    }
    const authResult = await authenticateGoogleDrive(clientId)
    if (!authResult.success || !authResult.accessToken) {
      return { success: false, error: authResult.error || 'Google authentication required' }
    }
    token = authResult.accessToken
  }

  try {
    const backupData = await generateBackupData()
    const filename = getBackupFilename(businessName)
    const jsonContent = JSON.stringify(backupData, null, 2)

    // Find or create folder in Google Drive
    const folderId = await getOrCreateBackupFolder(token)

    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: filename,
      mimeType: 'application/json',
    }

    if (folderId) {
      metadata.parents = [folderId]
    }

    // Multipart upload request
    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonContent +
      closeDelimiter

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      },
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const msg = errorData.error?.message || `Upload failed with HTTP ${response.status}`
      return { success: false, error: msg }
    }

    const uploaded = await response.json()
    return {
      success: true,
      filename,
      fileId: uploaded.id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload backup to Google Drive'
    return { success: false, error: msg }
  }
}
