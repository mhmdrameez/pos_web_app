import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CompletedSale } from '../../types'
import { getSettings, getCompletedSales } from '../db/database'
import { sqlExport, getSqliteBackupFilename } from '../db/sqliteClient'

let supabase: SupabaseClient | null = null
let cloudEnabled = false
let syncIntervalTimer: ReturnType<typeof setInterval> | null = null
let isSyncingInProgress = false
let lastSyncTimestamp: number | null = null
let lastSyncError: string | null = null

type SyncListener = (status: {
  isSyncing: boolean
  lastSyncTimestamp: number | null
  lastSyncError: string | null
  cloudEnabled: boolean
}) => void

const syncListeners = new Set<SyncListener>()

function notifyListeners() {
  const status = {
    isSyncing: isSyncingInProgress,
    lastSyncTimestamp,
    lastSyncError,
    cloudEnabled: isCloudEnabled(),
  }
  syncListeners.forEach((listener) => {
    try {
      listener(status)
    } catch {
      // Ignore listener error
    }
  })
}

export function subscribeCloudSyncStatus(listener: SyncListener): () => void {
  syncListeners.add(listener)
  listener({
    isSyncing: isSyncingInProgress,
    lastSyncTimestamp,
    lastSyncError,
    cloudEnabled: isCloudEnabled(),
  })
  return () => {
    syncListeners.delete(listener)
  }
}

export function getCloudSyncState() {
  return {
    isSyncing: isSyncingInProgress,
    lastSyncTimestamp,
    lastSyncError,
    cloudEnabled: isCloudEnabled(),
  }
}

/**
 * Initialize (or re-initialize) the Supabase client with the given credentials.
 * Call this on startup and whenever settings change.
 */
export function initSupabase(projectUrl: string, anonKey: string, enabled: boolean): void {
  cloudEnabled = enabled
  if (!enabled || !projectUrl || !anonKey) {
    supabase = null
    cloudEnabled = false
    stopPeriodicCloudSync()
    notifyListeners()
    return
  }
  try {
    supabase = createClient(projectUrl, anonKey)
    startPeriodicCloudSync()
    // Perform initial catch-up sync in background
    void syncAllPendingSales()
  } catch {
    supabase = null
    cloudEnabled = false
    stopPeriodicCloudSync()
  }
  notifyListeners()
}

/**
 * Try to initialize Supabase from saved settings.
 * Call this on app startup.
 */
export async function initSupabaseFromSettings(): Promise<void> {
  try {
    const settings = await getSettings()
    const sb = settings.supabaseSettings
    if (sb?.projectUrl && sb?.anonKey && sb?.enabled) {
      initSupabase(sb.projectUrl, sb.anonKey, sb.enabled)
    }
  } catch {
    // Settings not available yet — cloud stays off
  }
}

/** Check if cloud sync is active. */
export function isCloudEnabled(): boolean {
  return cloudEnabled && supabase !== null
}

/** Get the current Supabase client instance (or null if not initialized). */
export function getSupabaseClient(): SupabaseClient | null {
  return supabase
}

/**
 * Convert a CompletedSale to the Supabase row format (snake_case columns).
 */
export function toSupabaseRow(sale: CompletedSale) {
  return {
    id: sale.id,
    invoice_number: sale.invoiceNumber,
    order_number: sale.orderNumber,
    created_at: sale.createdAt,
    updated_at: sale.updatedAt,
    completed_at: sale.completedAt,
    status: sale.status,
    customer: sale.customer ?? null,
    items: sale.items,
    subtotal_paise: sale.subtotalPaise,
    discount_paise: sale.discountPaise,
    grand_total_paise: sale.grandTotalPaise,
    payment_method: sale.paymentMethod,
    amount_paid_paise: sale.amountPaidPaise ?? null,
    change_paise: sale.changePaise ?? null,
    email_sent_at: sale.emailSentAt ?? null,
  }
}

/**
 * Upsert a completed sale to Supabase. Fire-and-forget — errors are silently caught.
 * Works for both new sales and edited sales.
 */
export function syncCompletedSale(sale: CompletedSale): void {
  if (!isCloudEnabled() || !supabase) return

  const sync = async () => {
    try {
      const { error } = await supabase!
        .from('completed_sales')
        .upsert(toSupabaseRow(sale), { onConflict: 'id' })
      if (error) {
        lastSyncError = error.message
        console.warn('[Cloud Sync] Failed to sync sale:', error.message)
      } else {
        lastSyncTimestamp = Date.now()
        lastSyncError = null
      }
      notifyListeners()
    } catch (err) {
      lastSyncError = err instanceof Error ? err.message : 'Network error'
      notifyListeners()
    }
  }
  void sync()
}

/**
 * Batch sync all local completed sales to Supabase (e.g. yesterday's, today's, historical).
 * Upserts in batches of 50 items.
 */
export async function syncAllPendingSales(): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  if (!isCloudEnabled() || !supabase) {
    return { success: false, syncedCount: 0, error: 'Cloud sync is not enabled' }
  }

  if (isSyncingInProgress) {
    return { success: true, syncedCount: 0 }
  }

  isSyncingInProgress = true
  notifyListeners()

  try {
    const sales = await getCompletedSales()
    if (sales.length === 0) {
      lastSyncTimestamp = Date.now()
      lastSyncError = null
      isSyncingInProgress = false
      notifyListeners()
      return { success: true, syncedCount: 0 }
    }

    const batchSize = 50
    let totalSynced = 0

    for (let i = 0; i < sales.length; i += batchSize) {
      const batch = sales.slice(i, i + batchSize)
      const rows = batch.map(toSupabaseRow)

      const { error } = await supabase!
        .from('completed_sales')
        .upsert(rows, { onConflict: 'id' })

      if (error) {
        throw new Error(error.message)
      }
      totalSynced += batch.length
    }

    lastSyncTimestamp = Date.now()
    lastSyncError = null
    return { success: true, syncedCount: totalSynced }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync sales'
    lastSyncError = message
    console.warn('[Cloud Sync] Batch sync error:', message)
    return { success: false, syncedCount: 0, error: message }
  } finally {
    isSyncingInProgress = false
    notifyListeners()
  }
}

/**
 * Start periodic 30-second cloud sync background task.
 */
export function startPeriodicCloudSync(): void {
  if (syncIntervalTimer !== null) return

  // Every 30 seconds sync all pending / recent sales to cloud
  syncIntervalTimer = setInterval(() => {
    if (isCloudEnabled() && navigator.onLine) {
      void syncAllPendingSales()
    }
  }, 30_000)
}

/**
 * Stop periodic cloud sync.
 */
export function stopPeriodicCloudSync(): void {
  if (syncIntervalTimer !== null) {
    clearInterval(syncIntervalTimer)
    syncIntervalTimer = null
  }
}

/**
 * Upload the live SQLite database file to Supabase Storage.
 */
export async function uploadBackupToSupabaseStorage(
  businessName: string,
  bucketName?: string,
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const settings = await getSettings()
    let client = getSupabaseClient()
    if (!client) {
      const sb = settings.supabaseSettings
      if (sb?.projectUrl && sb?.anonKey) {
        client = createClient(sb.projectUrl, sb.anonKey)
      }
    }
    if (!client) {
      return { success: false, error: 'Supabase is not connected. Please configure and enable Cloud Sync first.' }
    }

    let bucket = bucketName || settings.supabaseSettings?.backupBucketName
    if (!bucket || !bucket.trim()) {
      return { success: false, error: 'Backup bucket name is not configured. Please set it in Cloud Sync settings.' }
    }
    bucket = bucket.trim()

    const bytes = await sqlExport()
    if (!bytes || bytes.byteLength === 0) {
      return { success: false, error: 'SQLite export returned no data' }
    }

    const filename = getSqliteBackupFilename(businessName)
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })

    const { error } = await client.storage
      .from(bucket)
      .upload(filename, blob, {
        contentType: 'application/octet-stream',
        upsert: true,
      })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, filename }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload SQLite backup to Supabase Storage'
    return { success: false, error: msg }
  }
}

/**
 * Test the Supabase connection by querying the completed_sales table.
 */
export async function testSupabaseConnection(
  projectUrl: string,
  anonKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectUrl || !anonKey) {
      return { success: false, error: 'Project URL and Anon Key are required' }
    }

    const client = createClient(projectUrl, anonKey)
    const { error } = await client.from('completed_sales').select('id').limit(1)

    if (error) {
      // Table might not exist — give a helpful message
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return {
          success: false,
          error: 'Table "completed_sales" not found. Please create it in your Supabase dashboard.',
        }
      }
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect to Supabase'
    return { success: false, error: message }
  }
}
