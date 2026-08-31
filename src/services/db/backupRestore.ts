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
 * All DELETEs + INSERTs run inside a single SQLite transaction so the restore
 * is atomic — either everything succeeds or nothing changes.
 *
 * Supports both v1 backups (Dexie/IndexedDB export) and v2 backups (SQLite export).
 * v1 rows have JSON-serialised objects for nested fields; v2 rows have flat SQL columns.
 */
import { sqlTransaction } from './sqliteClient'
import type { CompletedSale, SavedOrder, Coupon, AppSettings, PrinterSettings, CartSnapshot } from '../../types'
import type { ProductStat, ProductPairStat } from '../../types/suggestion'

type SqlParam = string | number | null
type Op = { sql: string; params?: SqlParam[] }

/** Bind value SQLite can accept. Nested objects/arrays from v1 JSON must become TEXT. */
function toSqlValue(value: unknown): SqlParam {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** TEXT columns that store JSON: keep an already-serialized string, otherwise stringify. */
function toJsonText(value: unknown, empty: string | null = null): SqlParam {
  if (value === undefined || value === null || value === '') return empty
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(value)
    }
  }
  return JSON.stringify(value)
}

export async function importBackup(file: File): Promise<{
  salesCount: number
  ordersCount: number
  productsCount: number
}> {
  const content = await file.text()
  const backup = parseBackupFile(content)

  const t = backup.tables

  // Build the full list of ops — clear all tables first, then re-insert everything.
  const ops: Op[] = [
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

  // ── completedSales ──────────────────────────────────────────────────────
  // v1 Dexie backups store `items`/`customer` as objects; v2 SQLite backups store TEXT.
  // Always coerce so sqlite-wasm never tries to bind a JS array (that throws and
  // rolls back the whole restore — suggestions would appear to "succeed" only if
  // a later retry imported productStats, or sales would vanish while stats remain
  // if BEGIN is not honoured).
  for (const raw of t.completedSales as (CompletedSale | Record<string, unknown>)[]) {
    const s = raw as CompletedSale & Record<string, unknown>
    const itemsText = toJsonText(s.items, '[]')
    if (!s.id || !s.invoiceNumber || !s.orderNumber || !s.paymentMethod || itemsText == null) {
      console.warn('[Restore] Skipping completed sale with missing required fields', s.id)
      continue
    }
    ops.push({
      sql: `INSERT OR REPLACE INTO completedSales
        (id, invoiceNumber, orderNumber, status, createdAt, updatedAt, completedAt,
         customer, items, subtotalPaise, discountPaise, grandTotalPaise,
         paymentMethod, amountPaidPaise, changePaise, emailSentAt,
         appliedCouponCode, issuedCouponCode)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        toSqlValue(s.id),
        toSqlValue(s.invoiceNumber),
        toSqlValue(s.orderNumber),
        toSqlValue(s.status ?? 'completed'),
        toSqlValue(s.createdAt),
        toSqlValue(s.updatedAt),
        toSqlValue(s.completedAt ?? s.createdAt),
        toJsonText(s.customer, null),
        itemsText,
        toSqlValue(s.subtotalPaise) ?? 0,
        toSqlValue(s.discountPaise) ?? 0,
        toSqlValue(s.grandTotalPaise) ?? 0,
        toSqlValue(s.paymentMethod),
        toSqlValue(s.amountPaidPaise),
        toSqlValue(s.changePaise),
        toSqlValue(s.emailSentAt),
        toSqlValue(s.appliedCouponCode),
        toSqlValue(s.issuedCouponCode),
      ],
    })
  }

  // ── savedOrders ─────────────────────────────────────────────────────────
  for (const raw of t.savedOrders as (SavedOrder | Record<string, unknown>)[]) {
    const o = raw as SavedOrder
    ops.push({
      sql: `INSERT OR REPLACE INTO savedOrders
        (id, orderNumber, status, createdAt, updatedAt, customer, items,
         subtotalPaise, discountPaise, grandTotalPaise)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [
        toSqlValue(o.id), toSqlValue(o.orderNumber), toSqlValue(o.status),
        toSqlValue(o.createdAt), toSqlValue(o.updatedAt),
        toJsonText(o.customer, null),
        toJsonText(o.items, '[]'),
        toSqlValue(o.subtotalPaise) ?? 0,
        toSqlValue(o.discountPaise) ?? 0,
        toSqlValue(o.grandTotalPaise) ?? 0,
      ],
    })
  }

  // ── settings ────────────────────────────────────────────────────────────
  for (const raw of t.settings as (AppSettings & { id: string } | Record<string, unknown>)[]) {
    const s = raw as AppSettings & { id: string }
    ops.push({
      sql: `INSERT OR REPLACE INTO settings
        (id, businessName, emailSettings, supabaseSettings, backupSettings)
       VALUES (?,?,?,?,?)`,
      params: [
        toSqlValue(s.id),
        toSqlValue(s.businessName) ?? 'INVOICE',
        toJsonText(s.emailSettings, null),
        toJsonText(s.supabaseSettings, null),
        toJsonText(s.backupSettings, null),
      ],
    })
  }

  // ── printerSettings ─────────────────────────────────────────────────────
  for (const raw of t.printerSettings as (PrinterSettings & { id: string } | Record<string, unknown>)[]) {
    const p = raw as PrinterSettings & { id: string }
    ops.push({
      sql: `INSERT OR REPLACE INTO printerSettings
        (id, paperWidth, deviceId, deviceName, pairedPrinters, showSuggestions)
       VALUES (?,?,?,?,?,?)`,
      params: [
        toSqlValue(p.id),
        toSqlValue(p.paperWidth) ?? 58,
        toSqlValue(p.deviceId),
        toSqlValue(p.deviceName),
        toJsonText(p.pairedPrinters, null),
        p.showSuggestions == null ? null : (p.showSuggestions ? 1 : 0),
      ],
    })
  }

  // ── cart ────────────────────────────────────────────────────────────────
  for (const raw of t.cart as (CartSnapshot & { id: string } | Record<string, unknown>)[]) {
    const c = raw as CartSnapshot & { id: string }
    ops.push({
      sql: `INSERT OR REPLACE INTO cart (id, items, currentAmount, customer, discountPaise) VALUES (?,?,?,?,?)`,
      params: [
        toSqlValue(c.id),
        toJsonText(c.items, '[]'),
        toSqlValue(c.currentAmount) ?? '',
        toJsonText(c.customer, null),
        toSqlValue(c.discountPaise) ?? 0,
      ],
    })
  }

  // ── counters ────────────────────────────────────────────────────────────
  for (const raw of t.counters as Record<string, unknown>[]) {
    ops.push({
      sql: `INSERT OR REPLACE INTO counters
        (id, invoiceSequence, orderSequence, salesCount, latestCompletedAt)
       VALUES (?,?,?,?,?)`,
      params: [
        toSqlValue(raw.id),
        toSqlValue(raw.invoiceSequence) ?? 0,
        toSqlValue(raw.orderSequence) ?? 0,
        toSqlValue(raw.salesCount) ?? 0,
        toSqlValue(raw.latestCompletedAt) ?? 0,
      ],
    })
  }

  // ── productStats ────────────────────────────────────────────────────────
  for (const raw of t.productStats as (ProductStat | Record<string, unknown>)[]) {
    const s = raw as ProductStat
    ops.push({
      sql: `INSERT OR REPLACE INTO productStats
        (productKey, displayName, totalCount, confirmedCount, rejectedCount,
         minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
         integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
         observationCount, priceBuckets)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        toSqlValue(s.productKey), toSqlValue(s.displayName),
        toSqlValue(s.totalCount) ?? 0, toSqlValue(s.confirmedCount) ?? 0, toSqlValue(s.rejectedCount) ?? 0,
        toSqlValue(s.minPricePaise) ?? 0, toSqlValue(s.maxPricePaise) ?? 0,
        toSqlValue(s.sumPricePaise) ?? 0, toSqlValue(s.sumPriceSq) ?? 0,
        toSqlValue(s.integerQtyCount) ?? 0, toSqlValue(s.decimalQtyCount) ?? 0,
        toSqlValue(s.lastSoldAt) ?? 0, toSqlValue(s.recencyMass) ?? 0,
        toSqlValue(s.observationCount) ?? 0,
        toJsonText(s.priceBuckets, '[]'),
      ],
    })
  }

  // ── productPairs ────────────────────────────────────────────────────────
  for (const raw of t.productPairs as ProductPairStat[]) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)',
      params: [toSqlValue(raw.id), toSqlValue(raw.count) ?? 0, toSqlValue(raw.lastSeenAt) ?? 0],
    })
  }

  // ── suggestionMeta ──────────────────────────────────────────────────────
  for (const raw of t.suggestionMeta as { id: string; fingerprint: string; rebuiltAt: number }[]) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES (?,?,?)',
      params: [toSqlValue(raw.id), toSqlValue(raw.fingerprint) ?? '', toSqlValue(raw.rebuiltAt) ?? 0],
    })
  }

  // ── coupons ─────────────────────────────────────────────────────────────
  for (const raw of t.coupons as (Coupon | Record<string, unknown>)[]) {
    const c = raw as Coupon
    ops.push({
      sql: `INSERT OR REPLACE INTO coupons
        (id, code, amountPaise, status, createdAt, usedAt, expiresAt, customerName)
       VALUES (?,?,?,?,?,?,?,?)`,
      params: [
        toSqlValue(c.id), toSqlValue(c.code), toSqlValue(c.amountPaise) ?? 0,
        toSqlValue(c.status), toSqlValue(c.createdAt),
        toSqlValue(c.usedAt),
        toSqlValue(c.expiresAt),
        toSqlValue(c.customerName),
      ],
    })
  }

  // Execute everything atomically in one transaction.
  // If any statement fails the entire restore is rolled back — the DB stays intact.
  await sqlTransaction(ops)

  const insertedSales = ops.filter((op) => op.sql.includes('INTO completedSales')).length
  console.log(
    `[Restore] Imported ${insertedSales} sales, ${t.savedOrders.length} orders, ${t.productStats.length} product stats`,
  )

  return {
    salesCount: insertedSales,
    ordersCount: t.savedOrders.length,
    productsCount: t.productStats.length,
  }
}

