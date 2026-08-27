/**
 * Google Drive API Service
 *
 * Allows uploading JSON database backups directly to the user's Google Drive.
 * Uses Google Identity Services (GIS) token client for seamless, secure in-browser OAuth.
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
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_FOLDER_NAME = 'QuickSale_Backups'

let tokenClient: ReturnType<NonNullable<NonNullable<NonNullable<Window['google']>['accounts']>['oauth2']>['initTokenClient']> | null = null
let currentAccessToken: string | null = null
let tokenExpiresAt = 0

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
 * Request an access token from Google using OAuth2 Popup.
 */
export async function authenticateGoogleDrive(clientId: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  if (!clientId || !clientId.trim()) {
    return { success: false, error: 'Google Client ID is required' }
  }

  await loadGsiScript()

  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2) {
      resolve({ success: false, error: 'Google Identity Services could not be initialized' })
      return
    }

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
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
                clientId: clientId.trim(),
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
      })

      tokenClient.requestAccessToken({ prompt: 'consent' })
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to launch Google Sign-in',
      })
    }
  })
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
