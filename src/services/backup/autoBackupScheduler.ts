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

const LAST_BACKUP_SENT_KEY = 'quick-sale-pos:backup-last-sent'
let backupSchedulerTimer: ReturnType<typeof setTimeout> | null = null

function getBlockKey(frequency: '10pm' | '12h'): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  
  if (frequency === '12h') {
    if (now.getHours() < 10) {
      const prev = new Date(now)
      prev.setDate(prev.getDate() - 1)
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}-22`
    } else if (now.getHours() < 22) {
      return `${dateStr}-10`
    } else {
      return `${dateStr}-22`
    }
  } else {
    // 10pm only.
    if (now.getHours() < 22) {
      const prev = new Date(now)
      prev.setDate(prev.getDate() - 1)
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}-22`
    } else {
      return `${dateStr}-22`
    }
  }
}

function getMsUntilNextTarget(frequency: '10pm' | '12h'): number {
  const now = new Date()
  const target10am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0)
  const target10pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0, 0)

  if (frequency === '12h') {
    if (now.getTime() < target10am.getTime()) return target10am.getTime() - now.getTime()
    if (now.getTime() < target10pm.getTime()) return target10pm.getTime() - now.getTime()
    
    target10am.setDate(target10am.getDate() + 1)
    return target10am.getTime() - now.getTime()
  } else {
    if (now.getTime() < target10pm.getTime()) return target10pm.getTime() - now.getTime()
    
    target10pm.setDate(target10pm.getDate() + 1)
    return target10pm.getTime() - now.getTime()
  }
}

function wasCurrentBlockRun(frequency: '10pm' | '12h'): boolean {
  try {
    const stored = localStorage.getItem(LAST_BACKUP_SENT_KEY)
    return stored === getBlockKey(frequency)
  } catch {
    return false
  }
}

function markCurrentBlockRun(frequency: '10pm' | '12h'): void {
  try {
    localStorage.setItem(LAST_BACKUP_SENT_KEY, getBlockKey(frequency))
  } catch {
    // non-critical
  }
}

async function runScheduledBackup(): Promise<void> {
  try {
    const settings = await getSettings()
    const frequency = settings.backupSettings?.autoBackupFrequency || '10pm'
    const isAutoBackupEnabled = settings.backupSettings?.autoBackup10pmEnabled !== false

    if (!isAutoBackupEnabled) {
      scheduleNextBackup(frequency)
      return
    }

    if (wasCurrentBlockRun(frequency)) {
      scheduleNextBackup(frequency)
      return
    }

    const businessName = settings.businessName || 'Quick Sale POS'

    // 1. If Google Drive is enabled with auto-upload, upload to Drive
    if (settings.googleDriveSettings?.enabled && settings.googleDriveSettings?.autoUploadDaily !== false) {
      try {
        await uploadCurrentBackupToGoogleDrive(businessName)
      } catch (err) {
        console.warn('[Auto Backup] Google drive upload warning:', err)
      }
    }

    markCurrentBlockRun(frequency)

    // Update settings with last backup date
    await saveSettings({
      ...settings,
      backupSettings: {
        autoBackup10pmEnabled: true,
        autoBackupFrequency: frequency,
        lastBackupDate: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[Auto Backup] Scheduled backup error:', err)
  } finally {
    // Note: We need to re-fetch settings in case frequency changed
    getSettings().then(s => {
       const freq = s.backupSettings?.autoBackupFrequency || '10pm'
       scheduleNextBackup(freq)
    })
  }
}

function scheduleNextBackup(frequency: '10pm' | '12h'): void {
  if (backupSchedulerTimer !== null) {
    clearTimeout(backupSchedulerTimer)
  }
  const msUntil = getMsUntilNextTarget(frequency)
  backupSchedulerTimer = setTimeout(() => {
    void runScheduledBackup()
  }, msUntil)
}

/**
 * Start the backup scheduler on application boot.
 * Also checks if we missed the current block and runs immediately if so.
 */
export function startDailyBackupScheduler(): void {
  getSettings().then(s => {
    const frequency = s.backupSettings?.autoBackupFrequency || '10pm'
    const isAutoBackupEnabled = s.backupSettings?.autoBackup10pmEnabled !== false
    
    if (isAutoBackupEnabled && !wasCurrentBlockRun(frequency)) {
      // Missed the current block's backup (e.g. app was closed at 10:00/22:00)
      void runScheduledBackup()
    } else {
      scheduleNextBackup(frequency)
    }
  })
}

/**
 * Manually trigger the backup flow immediately (for testing or manual run).
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
    const frequency = settings.backupSettings?.autoBackupFrequency || '10pm'

    const filename = await exportBackup(businessName)
    let driveUploaded = false

    if (settings.googleDriveSettings?.enabled) {
      const driveResult = await uploadCurrentBackupToGoogleDrive(businessName)
      driveUploaded = driveResult.success
    }

    markCurrentBlockRun(frequency)
    return { success: true, downloadedFilename: filename, driveUploaded }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown backup error',
    }
  }
}
