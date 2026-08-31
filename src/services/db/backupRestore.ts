import { getAllTableRows } from './database'

export interface BackupData {
  version: number
  createdAt: string
  tables: {
    completedSales: unknown[]
    savedOrders: unknown[]
    settings: unknown[]
    printerSettings: unknown[]
    cart: unknown[]
    counters: unknown[]
    productStats: unknown[]
    productPairs: unknown[]
    suggestionMeta: unknown[]
    coupons: unknown[]
  }
}

/**
 * Generate a complete BackupData object from all SQLite tables.
 */
export async function generateBackupData(): Promise<BackupData> {
  const [
    completedSales,
    savedOrders,
    settings,
    printerSettings,
    cart,
    counters,
    productStats,
    productPairs,
    suggestionMeta,
    coupons,
  ] = await Promise.all([
    getAllTableRows('completedSales'),
    getAllTableRows('savedOrders'),
    getAllTableRows('settings'),
    getAllTableRows('printerSettings'),
    getAllTableRows('cart'),
    getAllTableRows('counters'),
    getAllTableRows('productStats'),
    getAllTableRows('productPairs'),
    getAllTableRows('suggestionMeta'),
    getAllTableRows('coupons'),
  ])

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    tables: {
      completedSales,
      savedOrders,
      settings,
      printerSettings,
      cart,
      counters,
      productStats,
      productPairs,
      suggestionMeta,
      coupons,
    },
  }
}

/**
 * Generate backup filename based on business name.
 */
export function getBackupFilename(businessName: string): string {
  const safeName = businessName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'pos'
  const dateStr = new Date().toISOString().slice(0, 10)
  return `${safeName}_backup_${dateStr}.json`
}

/**
 * Export all SQLite tables into a single JSON backup file and trigger a download.
 */
export async function exportBackup(businessName: string): Promise<string> {
  const backup = await generateBackupData()
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const filename = getBackupFilename(businessName)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return filename
}

/**
 * Validate and parse a backup file. Returns the parsed data or throws an error.
 */
function parseBackupFile(content: string): BackupData {
  const data = JSON.parse(content) as BackupData

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backup file: not a JSON object')
  }

  if (!data.version || !data.tables) {
    throw new Error('Invalid backup file: missing version or tables')
  }

  const requiredTables = [
    'completedSales',
    'savedOrders',
    'settings',
    'printerSettings',
    'cart',
    'counters',
    'productStats',
    'productPairs',
    'suggestionMeta',
    'coupons',
  ] as const

  for (const table of requiredTables) {
    if (!Array.isArray(data.tables[table])) {
      // Allow missing tables — treat as empty (handles v1 backups without coupons)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(data.tables as any)[table] = []
    }
  }

  return data
}

/**
 * Import a backup file, replacing all existing data.
 * Returns a summary of what was imported.
 *
 * Supports both v1 backups (Dexie/IndexedDB export) and v2 backups (SQLite export).
 * v1 rows have JSON-serialised objects for nested fields; v2 rows have flat SQL columns.
 */
import { sqlRun, sqlTransaction } from './sqliteClient'
import type { CompletedSale, SavedOrder, Coupon, AppSettings, PrinterSettings, CartSnapshot } from '../../types'
import type { ProductStat, ProductPairStat } from '../../types/suggestion'

export async function importBackup(file: File): Promise<{
  salesCount: number
  ordersCount: number
  productsCount: number
}> {
  const content = await file.text()
  const backup = parseBackupFile(content)

  const isV1 = backup.version === 1

  // Clear all tables first
  const clearOps = [
    { sql: 'DELETE FROM completedSales' },
    { sql: 'DELETE FROM savedOrders' },
    { sql: 'DELETE FROM settings' },
    { sql: 'DELETE FROM printerSettings' },
    { sql: 'DELETE FROM cart' },
    { sql: 'DELETE FROM counters' },
    { sql: 'DELETE FROM productStats' },
    { sql: 'DELETE FROM productPairs' },
    { sql: 'DELETE FROM suggestionMeta' },
    { sql: 'DELETE FROM coupons' },
  ]
  await sqlTransaction(clearOps)

  const t = backup.tables

  // ── completedSales ──────────────────────────────────────────────────────
  for (const raw of t.completedSales as (CompletedSale | Record<string, unknown>)[]) {
    const s = raw as CompletedSale
    await sqlRun(
      `INSERT OR REPLACE INTO completedSales
        (id, invoiceNumber, orderNumber, status, createdAt, updatedAt, completedAt,
         customer, items, subtotalPaise, discountPaise, grandTotalPaise,
         paymentMethod, amountPaidPaise, changePaise, emailSentAt,
         appliedCouponCode, issuedCouponCode)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.id, s.invoiceNumber, s.orderNumber, s.status,
        s.createdAt, s.updatedAt, s.completedAt,
        // v1: customer is already an object; v2: already a JSON string or null
        isV1 ? (s.customer ? JSON.stringify(s.customer) : null) : ((raw as Record<string,unknown>).customer as string | null ?? null),
        isV1 ? JSON.stringify(s.items) : ((raw as Record<string,unknown>).items as string),
        s.subtotalPaise, s.discountPaise, s.grandTotalPaise,
        s.paymentMethod,
        s.amountPaidPaise ?? null,
        s.changePaise     ?? null,
        s.emailSentAt     ?? null,
        s.appliedCouponCode ?? null,
        s.issuedCouponCode  ?? null,
      ],
    )
  }

  // ── savedOrders ─────────────────────────────────────────────────────────
  for (const raw of t.savedOrders as (SavedOrder | Record<string, unknown>)[]) {
    const o = raw as SavedOrder
    await sqlRun(
      `INSERT OR REPLACE INTO savedOrders
        (id, orderNumber, status, createdAt, updatedAt, customer, items,
         subtotalPaise, discountPaise, grandTotalPaise)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        o.id, o.orderNumber, o.status, o.createdAt, o.updatedAt,
        isV1 ? (o.customer ? JSON.stringify(o.customer) : null) : ((raw as Record<string,unknown>).customer as string | null ?? null),
        isV1 ? JSON.stringify(o.items) : ((raw as Record<string,unknown>).items as string),
        o.subtotalPaise, o.discountPaise, o.grandTotalPaise,
      ],
    )
  }

  // ── settings ────────────────────────────────────────────────────────────
  for (const raw of t.settings as (AppSettings & { id: string } | Record<string, unknown>)[]) {
    const s = raw as AppSettings & { id: string }
    if (isV1) {
      await sqlRun(
        `INSERT OR REPLACE INTO settings
          (id, businessName, emailSettings, supabaseSettings, backupSettings)
         VALUES (?,?,?,?,?)`,
        [
          s.id, s.businessName,
          s.emailSettings    ? JSON.stringify(s.emailSettings)    : null,
          s.supabaseSettings ? JSON.stringify(s.supabaseSettings) : null,
          s.backupSettings   ? JSON.stringify(s.backupSettings)   : null,
        ],
      )
    } else {
      const r = raw as Record<string, unknown>
      await sqlRun(
        `INSERT OR REPLACE INTO settings
          (id, businessName, emailSettings, supabaseSettings, backupSettings)
         VALUES (?,?,?,?,?)`,
        [r.id as string, r.businessName as string, r.emailSettings as string | null, r.supabaseSettings as string | null, r.backupSettings as string | null],
      )
    }
  }

  // ── printerSettings ─────────────────────────────────────────────────────
  for (const raw of t.printerSettings as (PrinterSettings & { id: string } | Record<string, unknown>)[]) {
    const p = raw as PrinterSettings & { id: string }
    if (isV1) {
      await sqlRun(
        `INSERT OR REPLACE INTO printerSettings
          (id, paperWidth, deviceId, deviceName, pairedPrinters, showSuggestions)
         VALUES (?,?,?,?,?,?)`,
        [
          p.id, p.paperWidth,
          p.deviceId   ?? null, p.deviceName ?? null,
          p.pairedPrinters ? JSON.stringify(p.pairedPrinters) : null,
          p.showSuggestions != null ? (p.showSuggestions ? 1 : 0) : null,
        ],
      )
    } else {
      const r = raw as Record<string, unknown>
      await sqlRun(
        `INSERT OR REPLACE INTO printerSettings
          (id, paperWidth, deviceId, deviceName, pairedPrinters, showSuggestions)
         VALUES (?,?,?,?,?,?)`,
        [r.id as string, r.paperWidth as number, r.deviceId as string | null, r.deviceName as string | null, r.pairedPrinters as string | null, r.showSuggestions as number | null],
      )
    }
  }

  // ── cart ────────────────────────────────────────────────────────────────
  for (const raw of t.cart as (CartSnapshot & { id: string } | Record<string, unknown>)[]) {
    const c = raw as CartSnapshot & { id: string }
    if (isV1) {
      await sqlRun(
        `INSERT OR REPLACE INTO cart (id, items, currentAmount, customer, discountPaise) VALUES (?,?,?,?,?)`,
        [
          c.id,
          JSON.stringify(c.items),
          c.currentAmount,
          c.customer ? JSON.stringify(c.customer) : null,
          c.discountPaise,
        ],
      )
    } else {
      const r = raw as Record<string, unknown>
      await sqlRun(
        `INSERT OR REPLACE INTO cart (id, items, currentAmount, customer, discountPaise) VALUES (?,?,?,?,?)`,
        [r.id as string, r.items as string, r.currentAmount as string, r.customer as string | null, r.discountPaise as number],
      )
    }
  }

  // ── counters ────────────────────────────────────────────────────────────
  for (const raw of t.counters as Record<string, unknown>[]) {
    await sqlRun(
      `INSERT OR REPLACE INTO counters
        (id, invoiceSequence, orderSequence, salesCount, latestCompletedAt)
       VALUES (?,?,?,?,?)`,
      [
        raw.id as string,
        raw.invoiceSequence as number,
        raw.orderSequence   as number,
        (raw.salesCount         ?? 0) as number,
        (raw.latestCompletedAt  ?? 0) as number,
      ],
    )
  }

  // ── productStats ────────────────────────────────────────────────────────
  for (const raw of t.productStats as (ProductStat | Record<string, unknown>)[]) {
    const s = raw as ProductStat
    await sqlRun(
      `INSERT OR REPLACE INTO productStats
        (productKey, displayName, totalCount, confirmedCount, rejectedCount,
         minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
         integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
         observationCount, priceBuckets)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.productKey, s.displayName, s.totalCount, s.confirmedCount, s.rejectedCount,
        s.minPricePaise, s.maxPricePaise, s.sumPricePaise, s.sumPriceSq,
        s.integerQtyCount, s.decimalQtyCount, s.lastSoldAt, s.recencyMass,
        s.observationCount,
        isV1 ? JSON.stringify(s.priceBuckets) : ((raw as Record<string,unknown>).priceBuckets as string ?? '[]'),
      ],
    )
  }

  // ── productPairs ────────────────────────────────────────────────────────
  for (const raw of t.productPairs as ProductPairStat[]) {
    await sqlRun(
      'INSERT OR REPLACE INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)',
      [raw.id, raw.count, raw.lastSeenAt],
    )
  }

  // ── suggestionMeta ──────────────────────────────────────────────────────
  for (const raw of t.suggestionMeta as { id: string; fingerprint: string; rebuiltAt: number }[]) {
    await sqlRun(
      'INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES (?,?,?)',
      [raw.id, raw.fingerprint, raw.rebuiltAt],
    )
  }

  // ── coupons ─────────────────────────────────────────────────────────────
  for (const raw of t.coupons as (Coupon | Record<string, unknown>)[]) {
    const c = raw as Coupon
    await sqlRun(
      `INSERT OR REPLACE INTO coupons
        (id, code, amountPaise, status, createdAt, usedAt, expiresAt, customerName)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        c.id, c.code, c.amountPaise, c.status, c.createdAt,
        c.usedAt       ?? null,
        c.expiresAt    ?? null,
        c.customerName ?? null,
      ],
    )
  }

  return {
    salesCount: t.completedSales.length,
    ordersCount: t.savedOrders.length,
    productsCount: t.productStats.length,
  }
}
