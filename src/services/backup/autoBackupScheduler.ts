/**
 * Daily Backup Scheduler
 *
 * Automatically executes a database backup every day at 22:00 (10 PM) local time.
 * - Downloads the JSON backup file locally to the user's computer.
 * - If Google Drive is enabled and auto-upload is turned on, also uploads the backup to Google Drive.
 *
 * Uses localStorage to prevent duplicate automatic triggers if the tab is reloaded after 10 PM.
 */

import { getSettings, saveSettings } from '../db/database'
import { exportBackup } from '../db/backupRestore'
import { uploadCurrentBackupToGoogleDrive } from '../google/googleDriveService'

const LAST_BACKUP_SENT_KEY = 'quick-sale-pos:backup-10pm-last-sent'
let backupSchedulerTimer: ReturnType<typeof setTimeout> | null = null

function getMsUntilNextTenPM(): number {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    // Already past 10 PM today — schedule for tomorrow
    target.setDate(target.getDate() + 1)
  }
  return target.getTime() - now.getTime()
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function wasBackupAlreadyRunToday(): boolean {
  try {
    const stored = localStorage.getItem(LAST_BACKUP_SENT_KEY)
    return stored === todayKey()
  } catch {
    return false
  }
}

function markBackupRunToday(): void {
  try {
    localStorage.setItem(LAST_BACKUP_SENT_KEY, todayKey())
  } catch {
    // non-critical
  }
}

async function runDaily10PmBackup(): Promise<void> {
  if (wasBackupAlreadyRunToday()) {
    scheduleNext10PmBackup()
    return
  }

  try {
    const settings = await getSettings()
    // Auto-backup runs by default unless explicitly disabled in backupSettings
    const isAutoBackupEnabled = settings.backupSettings?.autoBackup10pmEnabled !== false

    if (!isAutoBackupEnabled) {
      scheduleNext10PmBackup()
      return
    }

    const businessName = settings.businessName || 'Quick Sale POS'

    // 1. Trigger local file download
    await exportBackup(businessName)

    // 2. If Google Drive is enabled with auto-upload, upload to Drive
    if (settings.googleDriveSettings?.enabled && settings.googleDriveSettings?.autoUploadDaily !== false) {
      try {
        await uploadCurrentBackupToGoogleDrive(businessName)
      } catch (err) {
        console.warn('[Auto Backup] Google drive upload warning:', err)
      }
    }

    markBackupRunToday()

    // Update settings with last backup date
    await saveSettings({
      ...settings,
      backupSettings: {
        autoBackup10pmEnabled: true,
        lastBackupDate: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[Auto Backup] 10 PM backup error:', err)
  } finally {
    scheduleNext10PmBackup()
  }
}

function scheduleNext10PmBackup(): void {
  if (backupSchedulerTimer !== null) {
    clearTimeout(backupSchedulerTimer)
  }
  const msUntil = getMsUntilNextTenPM()
  backupSchedulerTimer = setTimeout(() => {
    void runDaily10PmBackup()
  }, msUntil)
}

/**
 * Start the 10 PM daily backup scheduler on application boot.
 */
export function startDailyBackupScheduler(): void {
  scheduleNext10PmBackup()
}

/**
 * Manually trigger the 10 PM backup flow immediately (for testing or manual run).
 */
export async function triggerDailyBackupNow(): Promise<{
  success: boolean
  downloadedFilename?: string
  driveUploaded?: boolean
  error?: string
}> {
  try {
    const settings = await getSettings()
    const businessName = settings.businessName || 'Quick Sale POS'

    const filename = await exportBackup(businessName)
    let driveUploaded = false

    if (settings.googleDriveSettings?.enabled) {
      const driveResult = await uploadCurrentBackupToGoogleDrive(businessName)
      driveUploaded = driveResult.success
    }

    markBackupRunToday()
    return { success: true, downloadedFilename: filename, driveUploaded }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown backup error',
    }
  }
}
