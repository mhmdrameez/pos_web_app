import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CompletedSale } from '../../types'
import { getSettings } from '../db/database'

let supabase: SupabaseClient | null = null
let cloudEnabled = false

/**
 * Initialize (or re-initialize) the Supabase client with the given credentials.
 * Call this on startup and whenever settings change.
 */
export function initSupabase(projectUrl: string, anonKey: string, enabled: boolean): void {
  cloudEnabled = enabled
  if (!enabled || !projectUrl || !anonKey) {
    supabase = null
    cloudEnabled = false
    return
  }
  try {
    supabase = createClient(projectUrl, anonKey)
  } catch {
    supabase = null
    cloudEnabled = false
  }
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

/**
 * Convert a CompletedSale to the Supabase row format (snake_case columns).
 */
function toSupabaseRow(sale: CompletedSale) {
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

  supabase
    .from('completed_sales')
    .upsert(toSupabaseRow(sale), { onConflict: 'id' })
    .then(({ error }) => {
      if (error) {
        console.warn('[Cloud Sync] Failed to sync sale:', error.message)
      }
    })
    .catch(() => {
      // Network error — silently ignore, local data is safe
    })
}


/**
 * Test the Supabase connection by querying the completed_sales table.
 * Returns { success: true } or { success: false, error: string }.
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
