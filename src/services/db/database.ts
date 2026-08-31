/**
 * database.ts
 *
 * Public database API for Quick Sale POS.
 *
 * Internally backed by SQLite (via @sqlite.org/sqlite-wasm running in a Web
 * Worker with opfs-sahpool persistence).  All exported function signatures are
 * unchanged from the previous Dexie-based implementation so that the rest of
 * the app requires zero modifications.
 *
 * Initialise the DB with:
 *   await initializeDatabase()
 * after calling initSQLiteClient() at app startup.
 */

import { sqlRun, sqlQuery, sqlTransaction } from './sqliteClient'
import type {
  AppSettings,
  CartSnapshot,
  CompletedSale,
  PrinterSettings,
  SavedOrder,
  Coupon,
} from '../../types'
import type { ProductPairStat, ProductStat } from '../../types/suggestion'

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  businessName: 'INVOICE',
}

const DEFAULT_PRINTER: PrinterSettings = {
  paperWidth: 58,
}

const DEFAULT_CART: CartSnapshot = {
  items: [],
  currentAmount: '',
  customer: null,
  discountPaise: 0,
}

// ── LocalStorage backup (completed-sales) ─────────────────────────────────────

const COMPLETED_SALES_STORAGE_KEY = 'quick-sale-pos:completed-sales'

function getCompletedSalesBackup(): CompletedSale[] {
  try {
    const stored = localStorage.getItem(COMPLETED_SALES_STORAGE_KEY)
    const sales: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(sales) ? (sales as CompletedSale[]) : []
  } catch {
    return []
  }
}

function saveCompletedSalesBackup(sales: CompletedSale[]): void {
  try {
    localStorage.setItem(COMPLETED_SALES_STORAGE_KEY, JSON.stringify(sales))
  } catch {
    // SQLite remains the primary store if browser storage is unavailable or full.
  }
}

// ── Row mapping helpers ───────────────────────────────────────────────────────

type RawSale = {
  id: string; invoiceNumber: string; orderNumber: string; status: string
  createdAt: number; updatedAt: number; completedAt: number
  customer: string | null; items: string
  subtotalPaise: number; discountPaise: number; grandTotalPaise: number
  paymentMethod: string; amountPaidPaise: number | null; changePaise: number | null
  emailSentAt: number | null; appliedCouponCode: string | null; issuedCouponCode: string | null
}

function rowToCompletedSale(r: RawSale): CompletedSale {
  return {
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    orderNumber: r.orderNumber,
    status: r.status as CompletedSale['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
    customer: r.customer ? (JSON.parse(r.customer) as CompletedSale['customer']) : undefined,
    items: JSON.parse(r.items) as CompletedSale['items'],
    subtotalPaise: r.subtotalPaise,
    discountPaise: r.discountPaise,
    grandTotalPaise: r.grandTotalPaise,
    paymentMethod: r.paymentMethod as CompletedSale['paymentMethod'],
    amountPaidPaise: r.amountPaidPaise ?? undefined,
    changePaise: r.changePaise ?? undefined,
    emailSentAt: r.emailSentAt ?? undefined,
    appliedCouponCode: r.appliedCouponCode ?? undefined,
    issuedCouponCode: r.issuedCouponCode ?? undefined,
  }
}

type RawOrder = {
  id: string; orderNumber: string; status: string
  createdAt: number; updatedAt: number
  customer: string | null; items: string
  subtotalPaise: number; discountPaise: number; grandTotalPaise: number
}

function rowToSavedOrder(r: RawOrder): SavedOrder {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    status: r.status as SavedOrder['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    customer: r.customer ? (JSON.parse(r.customer) as SavedOrder['customer']) : undefined,
    items: JSON.parse(r.items) as SavedOrder['items'],
    subtotalPaise: r.subtotalPaise,
    discountPaise: r.discountPaise,
    grandTotalPaise: r.grandTotalPaise,
  }
}

type RawSettings = {
  id: string; businessName: string
  emailSettings: string | null; supabaseSettings: string | null; backupSettings: string | null
}

function rowToAppSettings(r: RawSettings): AppSettings {
  return {
    businessName: r.businessName,
    emailSettings: r.emailSettings ? JSON.parse(r.emailSettings) as AppSettings['emailSettings'] : undefined,
    supabaseSettings: r.supabaseSettings ? JSON.parse(r.supabaseSettings) as AppSettings['supabaseSettings'] : undefined,
    backupSettings: r.backupSettings ? JSON.parse(r.backupSettings) as AppSettings['backupSettings'] : undefined,
  }
}

type RawPrinter = {
  id: string; paperWidth: number
  deviceId: string | null; deviceName: string | null
  pairedPrinters: string | null; showSuggestions: number | null
}

function rowToPrinterSettings(r: RawPrinter): PrinterSettings {
  return {
    paperWidth: r.paperWidth as PrinterSettings['paperWidth'],
    deviceId: r.deviceId ?? undefined,
    deviceName: r.deviceName ?? undefined,
    pairedPrinters: r.pairedPrinters ? JSON.parse(r.pairedPrinters) as PrinterSettings['pairedPrinters'] : undefined,
    showSuggestions: r.showSuggestions != null ? Boolean(r.showSuggestions) : undefined,
  }
}

type RawCart = {
  id: string; items: string; currentAmount: string; customer: string | null; discountPaise: number
}

function rowToCartSnapshot(r: RawCart): CartSnapshot {
  return {
    items: JSON.parse(r.items) as CartSnapshot['items'],
    currentAmount: r.currentAmount,
    customer: r.customer ? JSON.parse(r.customer) as CartSnapshot['customer'] : null,
    discountPaise: r.discountPaise,
  }
}

type RawProductStat = {
  productKey: string; displayName: string; totalCount: number; confirmedCount: number
  rejectedCount: number; minPricePaise: number; maxPricePaise: number; sumPricePaise: number
  sumPriceSq: number; integerQtyCount: number; decimalQtyCount: number; lastSoldAt: number
  recencyMass: number; observationCount: number; priceBuckets: string
}

function rowToProductStat(r: RawProductStat): ProductStat {
  return {
    productKey: r.productKey,
    displayName: r.displayName,
    totalCount: r.totalCount,
    confirmedCount: r.confirmedCount,
    rejectedCount: r.rejectedCount,
    minPricePaise: r.minPricePaise,
    maxPricePaise: r.maxPricePaise,
    sumPricePaise: r.sumPricePaise,
    sumPriceSq: r.sumPriceSq,
    integerQtyCount: r.integerQtyCount,
    decimalQtyCount: r.decimalQtyCount,
    lastSoldAt: r.lastSoldAt,
    recencyMass: r.recencyMass,
    observationCount: r.observationCount,
    priceBuckets: JSON.parse(r.priceBuckets) as ProductStat['priceBuckets'],
  }
}

type RawCoupon = {
  id: string; code: string; amountPaise: number; status: string; createdAt: number
  usedAt: number | null; expiresAt: number | null; customerName: string | null
}

function rowToCoupon(r: RawCoupon): Coupon {
  return {
    id: r.id,
    code: r.code,
    amountPaise: r.amountPaise,
    status: r.status as Coupon['status'],
    createdAt: r.createdAt,
    usedAt: r.usedAt ?? undefined,
    expiresAt: r.expiresAt ?? undefined,
    customerName: r.customerName ?? undefined,
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const rows = await sqlQuery<RawSettings>('SELECT * FROM settings WHERE id = ?', ['default'])
  return rows.length > 0 ? rowToAppSettings(rows[0]) : DEFAULT_SETTINGS
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO settings
      (id, businessName, emailSettings, supabaseSettings, backupSettings)
     VALUES (?,?,?,?,?)`,
    [
      'default',
      settings.businessName,
      settings.emailSettings    ? JSON.stringify(settings.emailSettings)    : null,
      settings.supabaseSettings ? JSON.stringify(settings.supabaseSettings) : null,
      settings.backupSettings   ? JSON.stringify(settings.backupSettings)   : null,
    ],
  )
}

// ── Printer settings ──────────────────────────────────────────────────────────

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const rows = await sqlQuery<RawPrinter>('SELECT * FROM printerSettings WHERE id = ?', ['default'])
  return rows.length > 0 ? rowToPrinterSettings(rows[0]) : DEFAULT_PRINTER
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO printerSettings
      (id, paperWidth, deviceId, deviceName, pairedPrinters, showSuggestions)
     VALUES (?,?,?,?,?,?)`,
    [
      'default',
      settings.paperWidth,
      settings.deviceId   ?? null,
      settings.deviceName ?? null,
      settings.pairedPrinters ? JSON.stringify(settings.pairedPrinters) : null,
      settings.showSuggestions != null ? (settings.showSuggestions ? 1 : 0) : null,
    ],
  )
}

// ── Cart snapshot ─────────────────────────────────────────────────────────────

export async function getCartSnapshot(): Promise<CartSnapshot> {
  const rows = await sqlQuery<RawCart>('SELECT * FROM cart WHERE id = ?', ['current'])
  return rows.length > 0 ? rowToCartSnapshot(rows[0]) : DEFAULT_CART
}

export async function saveCartSnapshot(cart: CartSnapshot): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO cart
      (id, items, currentAmount, customer, discountPaise)
     VALUES (?,?,?,?,?)`,
    [
      'current',
      JSON.stringify(cart.items),
      cart.currentAmount,
      cart.customer ? JSON.stringify(cart.customer) : null,
      cart.discountPaise,
    ],
  )
}

// ── Saved orders ──────────────────────────────────────────────────────────────

export async function getSavedOrders(): Promise<SavedOrder[]> {
  const rows = await sqlQuery<RawOrder>(
    `SELECT * FROM savedOrders WHERE status = 'draft' ORDER BY updatedAt DESC`,
  )
  return rows.map(rowToSavedOrder)
}

export async function saveOrder(order: SavedOrder): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO savedOrders
      (id, orderNumber, status, createdAt, updatedAt, customer, items,
       subtotalPaise, discountPaise, grandTotalPaise)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      order.id, order.orderNumber, order.status, order.createdAt, order.updatedAt,
      order.customer ? JSON.stringify(order.customer) : null,
      JSON.stringify(order.items),
      order.subtotalPaise, order.discountPaise, order.grandTotalPaise,
    ],
  )
}

export async function getSavedOrder(id: string): Promise<SavedOrder | undefined> {
  const rows = await sqlQuery<RawOrder>('SELECT * FROM savedOrders WHERE id = ?', [id])
  return rows.length > 0 ? rowToSavedOrder(rows[0]) : undefined
}

export async function deleteSavedOrder(id: string): Promise<void> {
  await sqlRun('DELETE FROM savedOrders WHERE id = ?', [id])
}

// ── Completed sales ───────────────────────────────────────────────────────────

export async function getCompletedSales(): Promise<CompletedSale[]> {
  const rows = await sqlQuery<RawSale>(
    'SELECT * FROM completedSales ORDER BY completedAt DESC',
  )

  if (rows.length > 0) {
    const sales = rows.map(rowToCompletedSale)
    saveCompletedSalesBackup(sales)
    return sales
  }

  // Fall back to localStorage backup (first run after migration, or empty DB)
  const backup = getCompletedSalesBackup()
  if (backup.length > 0) {
    // Re-hydrate SQLite from the backup
    for (const sale of backup) {
      await _insertCompletedSale(sale)
    }
    return backup.sort((a, b) => b.completedAt - a.completedAt)
  }

  return []
}

export async function getCompletedSale(id: string): Promise<CompletedSale | undefined> {
  const rows = await sqlQuery<RawSale>('SELECT * FROM completedSales WHERE id = ?', [id])
  return rows.length > 0 ? rowToCompletedSale(rows[0]) : undefined
}

/** Internal helper – inserts or replaces a completed sale row. */
async function _insertCompletedSale(sale: CompletedSale): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO completedSales
      (id, invoiceNumber, orderNumber, status, createdAt, updatedAt, completedAt,
       customer, items, subtotalPaise, discountPaise, grandTotalPaise,
       paymentMethod, amountPaidPaise, changePaise, emailSentAt,
       appliedCouponCode, issuedCouponCode)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      sale.id, sale.invoiceNumber, sale.orderNumber, sale.status,
      sale.createdAt, sale.updatedAt, sale.completedAt,
      sale.customer ? JSON.stringify(sale.customer) : null,
      JSON.stringify(sale.items),
      sale.subtotalPaise, sale.discountPaise, sale.grandTotalPaise,
      sale.paymentMethod,
      sale.amountPaidPaise ?? null,
      sale.changePaise     ?? null,
      sale.emailSentAt     ?? null,
      sale.appliedCouponCode ?? null,
      sale.issuedCouponCode  ?? null,
    ],
  )
}

export async function saveCompletedSale(sale: CompletedSale): Promise<void> {
  await _insertCompletedSale(sale)

  // Keep localStorage backup in sync
  const backup = getCompletedSalesBackup().filter((s) => s.id !== sale.id)
  backup.unshift(sale)
  saveCompletedSalesBackup(backup)

  // Incrementally update the sales counter for fast fingerprinting
  try {
    const counters = await sqlQuery<{ invoiceSequence: number; orderSequence: number; salesCount: number; latestCompletedAt: number }>(
      "SELECT * FROM counters WHERE id = 'default'",
    )
    if (counters.length > 0) {
      const c = counters[0]
      await sqlRun(
        "UPDATE counters SET salesCount = ?, latestCompletedAt = ? WHERE id = 'default'",
        [
          (c.salesCount ?? 0) + 1,
          Math.max(c.latestCompletedAt ?? 0, sale.completedAt),
        ],
      )
    }
  } catch {
    // Non-critical — fingerprint will fall back to full scan
  }
}

export async function getSalesByDateRange(fromTs: number, toTs: number): Promise<CompletedSale[]> {
  const rows = await sqlQuery<RawSale>(
    'SELECT * FROM completedSales WHERE completedAt >= ? AND completedAt <= ? ORDER BY completedAt DESC',
    [fromTs, toTs],
  )
  return rows.map(rowToCompletedSale)
}

export async function markEmailSent(saleId: string, sentAt: number): Promise<void> {
  await sqlRun('UPDATE completedSales SET emailSentAt = ? WHERE id = ?', [sentAt, saleId])
  const backup = getCompletedSalesBackup().map((s) =>
    s.id === saleId ? { ...s, emailSentAt: sentAt } : s,
  )
  saveCompletedSalesBackup(backup)
}

export async function cancelCompletedSale(id: string): Promise<void> {
  const sale = await getCompletedSale(id)
  if (!sale) throw new Error('Sale not found')
  if (sale.status === 'cancelled') return

  const updated: CompletedSale = {
    ...sale,
    status: 'cancelled',
    updatedAt: Date.now(),
  }

  await _insertCompletedSale(updated)

  const backup = getCompletedSalesBackup().map((s) => (s.id === id ? updated : s))
  saveCompletedSalesBackup(backup)

  await decrementSalesCounter()

  const { forgetCompletedSale, persistSuggestionSnapshot } = await import('../suggestion')
  forgetCompletedSale(sale)
  await persistSuggestionSnapshot()

  // Fire-and-forget cloud sync for cancellation
  import('../cloud/supabaseSync').then(({ syncCompletedSale }) => {
    syncCompletedSale(updated)
  }).catch(() => {})
}

// ── Invoice / order counters ──────────────────────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  const rows = await sqlQuery<{ invoiceSequence: number; orderSequence: number }>(
    "SELECT invoiceSequence, orderSequence FROM counters WHERE id = 'default'",
  )
  const next = (rows[0]?.invoiceSequence ?? 0) + 1
  await sqlRun(
    "UPDATE counters SET invoiceSequence = ? WHERE id = 'default'",
    [next],
  )
  return `INV-${next.toString().padStart(6, '0')}`
}

// ── Suggestion index ──────────────────────────────────────────────────────────

export async function getSuggestionMeta(): Promise<{ fingerprint: string; rebuiltAt: number } | undefined> {
  const rows = await sqlQuery<{ id: string; fingerprint: string; rebuiltAt: number }>(
    "SELECT * FROM suggestionMeta WHERE id = 'default'",
  )
  if (!rows.length) return undefined
  return { fingerprint: rows[0].fingerprint, rebuiltAt: rows[0].rebuiltAt }
}

export async function saveSuggestionIndex(
  stats: ProductStat[],
  pairs: ProductPairStat[],
  fingerprint: string,
): Promise<void> {
  const ops = [
    { sql: 'DELETE FROM productStats' },
    { sql: 'DELETE FROM productPairs' },
    ...stats.map((s) => ({
      sql: `INSERT INTO productStats
              (productKey, displayName, totalCount, confirmedCount, rejectedCount,
               minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
               integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
               observationCount, priceBuckets)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        s.productKey, s.displayName, s.totalCount, s.confirmedCount, s.rejectedCount,
        s.minPricePaise, s.maxPricePaise, s.sumPricePaise, s.sumPriceSq,
        s.integerQtyCount, s.decimalQtyCount, s.lastSoldAt, s.recencyMass,
        s.observationCount, JSON.stringify(s.priceBuckets),
      ] as (string | number | null)[],
    })),
    ...pairs.map((p) => ({
      sql: 'INSERT INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)',
      params: [p.id, p.count, p.lastSeenAt] as (string | number)[],
    })),
    {
      sql: `INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES ('default',?,?)`,
      params: [fingerprint, Date.now()] as (string | number)[],
    },
  ]
  await sqlTransaction(ops)
}

export async function incrementalSaveSuggestionStats(
  stats: ProductStat[],
  pairs: ProductPairStat[],
  deletedStatKeys: string[],
  fingerprint: string,
): Promise<void> {
  const ops = [
    ...stats.map((s) => ({
      sql: `INSERT OR REPLACE INTO productStats
              (productKey, displayName, totalCount, confirmedCount, rejectedCount,
               minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
               integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
               observationCount, priceBuckets)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        s.productKey, s.displayName, s.totalCount, s.confirmedCount, s.rejectedCount,
        s.minPricePaise, s.maxPricePaise, s.sumPricePaise, s.sumPriceSq,
        s.integerQtyCount, s.decimalQtyCount, s.lastSoldAt, s.recencyMass,
        s.observationCount, JSON.stringify(s.priceBuckets),
      ] as (string | number | null)[],
    })),
    ...pairs.map((p) => ({
      sql: 'INSERT OR REPLACE INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)',
      params: [p.id, p.count, p.lastSeenAt] as (string | number)[],
    })),
    ...deletedStatKeys.map((key) => ({
      sql: 'DELETE FROM productStats WHERE productKey = ?',
      params: [key] as string[],
    })),
    {
      sql: `INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES ('default',?,?)`,
      params: [fingerprint, Date.now()] as (string | number)[],
    },
  ]
  await sqlTransaction(ops)
}

export async function saveSuggestionFingerprint(fingerprint: string): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES ('default',?,?)`,
    [fingerprint, Date.now()],
  )
}

export async function loadSuggestionIndex(): Promise<{ stats: ProductStat[]; pairs: ProductPairStat[] }> {
  const [statRows, pairRows] = await Promise.all([
    sqlQuery<RawProductStat>('SELECT * FROM productStats'),
    sqlQuery<{ id: string; count: number; lastSeenAt: number }>('SELECT * FROM productPairs'),
  ])
  return {
    stats: statRows.map(rowToProductStat),
    pairs: pairRows,
  }
}

export async function upsertProductStat(stat: ProductStat): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO productStats
      (productKey, displayName, totalCount, confirmedCount, rejectedCount,
       minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
       integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
       observationCount, priceBuckets)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      stat.productKey, stat.displayName, stat.totalCount, stat.confirmedCount, stat.rejectedCount,
      stat.minPricePaise, stat.maxPricePaise, stat.sumPricePaise, stat.sumPriceSq,
      stat.integerQtyCount, stat.decimalQtyCount, stat.lastSoldAt, stat.recencyMass,
      stat.observationCount, JSON.stringify(stat.priceBuckets),
    ],
  )
}

export async function upsertProductPair(pair: ProductPairStat): Promise<void> {
  await sqlRun(
    'INSERT OR REPLACE INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)',
    [pair.id, pair.count, pair.lastSeenAt],
  )
}

// ── Sales fingerprint ─────────────────────────────────────────────────────────

export async function computeSalesFingerprintFast(): Promise<string> {
  const rows = await sqlQuery<{ salesCount: number; latestCompletedAt: number }>(
    "SELECT salesCount, latestCompletedAt FROM counters WHERE id = 'default'",
  )
  const counter = rows[0]
  if (counter && counter.salesCount != null && counter.salesCount > 0) {
    return `${counter.salesCount}:${counter.latestCompletedAt ?? 0}`
  }
  return computeSalesFingerprint()
}

export async function computeSalesFingerprint(): Promise<string> {
  const rows = await sqlQuery<{ cnt: number; latest: number }>(
    `SELECT COUNT(*) AS cnt, MAX(completedAt) AS latest
     FROM completedSales WHERE status != 'cancelled'`,
  )
  const count  = rows[0]?.cnt    ?? 0
  const latest = rows[0]?.latest ?? 0
  try {
    await sqlRun(
      "UPDATE counters SET salesCount = ?, latestCompletedAt = ? WHERE id = 'default'",
      [count, latest],
    )
  } catch {
    // Non-critical
  }
  return `${count}:${latest}`
}

// ── Sales counter helpers ─────────────────────────────────────────────────────

export async function decrementSalesCounter(): Promise<void> {
  try {
    const rows = await sqlQuery<{ salesCount: number }>(
      "SELECT salesCount FROM counters WHERE id = 'default'",
    )
    const current = rows[0]?.salesCount ?? 0
    if (current > 0) {
      await sqlRun(
        "UPDATE counters SET salesCount = ? WHERE id = 'default'",
        [current - 1],
      )
    }
  } catch {
    // Non-critical
  }
}

// ── Coupons ───────────────────────────────────────────────────────────────────

export async function createCoupon(coupon: Coupon): Promise<void> {
  await sqlRun(
    `INSERT OR REPLACE INTO coupons
      (id, code, amountPaise, status, createdAt, usedAt, expiresAt, customerName)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      coupon.id, coupon.code, coupon.amountPaise, coupon.status, coupon.createdAt,
      coupon.usedAt       ?? null,
      coupon.expiresAt    ?? null,
      coupon.customerName ?? null,
    ],
  )
}

export async function getCouponByCode(code: string): Promise<Coupon | undefined> {
  const rows = await sqlQuery<RawCoupon>('SELECT * FROM coupons WHERE code = ? LIMIT 1', [code])
  return rows.length > 0 ? rowToCoupon(rows[0]) : undefined
}

export async function markCouponUsed(id: string): Promise<void> {
  await sqlRun(
    "UPDATE coupons SET status = 'used', usedAt = ? WHERE id = ?",
    [Date.now(), id],
  )
}

export async function cancelCoupon(id: string): Promise<void> {
  await sqlRun("UPDATE coupons SET status = 'cancelled' WHERE id = ?", [id])
}

export async function getAllCoupons(): Promise<Coupon[]> {
  const rows = await sqlQuery<RawCoupon>('SELECT * FROM coupons ORDER BY createdAt DESC')
  return rows.map(rowToCoupon)
}

// ── Initialise database ───────────────────────────────────────────────────────

/**
 * Seed default rows if they don't exist yet.
 * Call once after initSQLiteClient() resolves.
 */
export async function initializeDatabase(): Promise<void> {
  const [settingsRows, printerRows, counterRows] = await Promise.all([
    sqlQuery("SELECT id FROM settings WHERE id = 'default'"),
    sqlQuery("SELECT id FROM printerSettings WHERE id = 'default'"),
    sqlQuery("SELECT id FROM counters WHERE id = 'default'"),
  ])

  if (!settingsRows.length) {
    await saveSettings(DEFAULT_SETTINGS)
  }
  if (!printerRows.length) {
    await savePrinterSettings(DEFAULT_PRINTER)
  }
  if (!counterRows.length) {
    await sqlRun(
      `INSERT INTO counters (id, invoiceSequence, orderSequence, salesCount, latestCompletedAt)
       VALUES ('default', 0, 0, 0, 0)`,
    )
  }
}

// ── getAllTableRows (used by backup/restore) ───────────────────────────────────

/** Return all rows from a given table as plain objects. For backup purposes. */
export async function getAllTableRows(table: string): Promise<unknown[]> {
  return sqlQuery(`SELECT * FROM ${table}`)
}
