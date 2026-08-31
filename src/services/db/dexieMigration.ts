/**
 * dexieMigration.ts
 *
 * One-shot migration helper: reads all data from the old Dexie/IndexedDB
 * database ("QuickSalePOS") and inserts it into the new SQLite database.
 *
 * Uses raw IndexedDB APIs so that the `dexie` package is no longer required.
 *
 * After a successful migration the flag 'quick-sale-pos:sqlite-migrated' is
 * written to localStorage and the function becomes a no-op on every subsequent
 * app load.
 */

import { sqlRun, sqlQuery } from './sqliteClient'
import type { AppSettings, CartSnapshot, CompletedSale, Coupon, PrinterSettings, SavedOrder } from '../../types'
import type { ProductPairStat, ProductStat } from '../../types/suggestion'

const MIGRATION_FLAG = 'quick-sale-pos:sqlite-migrated'
const DEXIE_DB_NAME  = 'QuickSalePOS'

// ── IndexedDB helper ─────────────────────────────────────────────────────────

function openLegacyDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DEXIE_DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => resolve(null)   // DB may not exist – that's fine
    req.onblocked = () => resolve(null)
  })
}

function readTable<T>(db: IDBDatabase, tableName: string): Promise<T[]> {
  return new Promise((resolve) => {
    const storeNames = Array.from(db.objectStoreNames)
    if (!storeNames.includes(tableName)) {
      resolve([])
      return
    }
    try {
      const tx    = db.transaction(tableName, 'readonly')
      const store = tx.objectStore(tableName)
      const req   = store.getAll()
      req.onsuccess = () => resolve((req.result as T[]) ?? [])
      req.onerror   = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

// ── Migrate helpers ──────────────────────────────────────────────────────────

async function migrateCompletedSales(rows: CompletedSale[]) {
  for (const s of rows) {
    await sqlRun(
      `INSERT OR IGNORE INTO completedSales
        (id, invoiceNumber, orderNumber, status, createdAt, updatedAt, completedAt,
         customer, items, subtotalPaise, discountPaise, grandTotalPaise,
         paymentMethod, amountPaidPaise, changePaise, emailSentAt,
         appliedCouponCode, issuedCouponCode)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.id, s.invoiceNumber, s.orderNumber, s.status,
        s.createdAt, s.updatedAt, s.completedAt,
        s.customer ? JSON.stringify(s.customer) : null,
        JSON.stringify(s.items),
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
}

async function migrateSavedOrders(rows: SavedOrder[]) {
  for (const o of rows) {
    await sqlRun(
      `INSERT OR IGNORE INTO savedOrders
        (id, orderNumber, status, createdAt, updatedAt, customer, items,
         subtotalPaise, discountPaise, grandTotalPaise)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        o.id, o.orderNumber, o.status, o.createdAt, o.updatedAt,
        o.customer ? JSON.stringify(o.customer) : null,
        JSON.stringify(o.items),
        o.subtotalPaise, o.discountPaise, o.grandTotalPaise,
      ],
    )
  }
}

async function migrateSettings(rows: Array<AppSettings & { id: string }>) {
  for (const s of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO settings
        (id, businessName, emailSettings, supabaseSettings, backupSettings)
       VALUES (?,?,?,?,?)`,
      [
        s.id,
        s.businessName,
        s.emailSettings    ? JSON.stringify(s.emailSettings)    : null,
        s.supabaseSettings ? JSON.stringify(s.supabaseSettings) : null,
        s.backupSettings   ? JSON.stringify(s.backupSettings)   : null,
      ],
    )
  }
}

async function migratePrinterSettings(rows: Array<PrinterSettings & { id: string }>) {
  for (const p of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO printerSettings
        (id, paperWidth, deviceId, deviceName, pairedPrinters, showSuggestions)
       VALUES (?,?,?,?,?,?)`,
      [
        p.id, p.paperWidth,
        p.deviceId   ?? null,
        p.deviceName ?? null,
        p.pairedPrinters ? JSON.stringify(p.pairedPrinters) : null,
        p.showSuggestions != null ? (p.showSuggestions ? 1 : 0) : null,
      ],
    )
  }
}

async function migrateCart(rows: Array<CartSnapshot & { id: string }>) {
  for (const c of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO cart
        (id, items, currentAmount, customer, discountPaise)
       VALUES (?,?,?,?,?)`,
      [
        c.id,
        JSON.stringify(c.items),
        c.currentAmount,
        c.customer ? JSON.stringify(c.customer) : null,
        c.discountPaise,
      ],
    )
  }
}

async function migrateCounters(rows: Array<{ id: string; invoiceSequence: number; orderSequence: number; salesCount?: number; latestCompletedAt?: number }>) {
  for (const c of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO counters
        (id, invoiceSequence, orderSequence, salesCount, latestCompletedAt)
       VALUES (?,?,?,?,?)`,
      [
        c.id,
        c.invoiceSequence,
        c.orderSequence,
        c.salesCount        ?? 0,
        c.latestCompletedAt ?? 0,
      ],
    )
  }
}

async function migrateProductStats(rows: ProductStat[]) {
  for (const s of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO productStats
        (productKey, displayName, totalCount, confirmedCount, rejectedCount,
         minPricePaise, maxPricePaise, sumPricePaise, sumPriceSq,
         integerQtyCount, decimalQtyCount, lastSoldAt, recencyMass,
         observationCount, priceBuckets)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.productKey, s.displayName,
        s.totalCount, s.confirmedCount, s.rejectedCount,
        s.minPricePaise, s.maxPricePaise, s.sumPricePaise, s.sumPriceSq,
        s.integerQtyCount, s.decimalQtyCount,
        s.lastSoldAt, s.recencyMass, s.observationCount,
        JSON.stringify(s.priceBuckets),
      ],
    )
  }
}

async function migrateProductPairs(rows: ProductPairStat[]) {
  for (const p of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO productPairs (id, count, lastSeenAt) VALUES (?,?,?)`,
      [p.id, p.count, p.lastSeenAt],
    )
  }
}

async function migrateSuggestionMeta(rows: Array<{ id: string; fingerprint: string; rebuiltAt: number }>) {
  for (const m of rows) {
    await sqlRun(
      `INSERT OR REPLACE INTO suggestionMeta (id, fingerprint, rebuiltAt) VALUES (?,?,?)`,
      [m.id, m.fingerprint, m.rebuiltAt],
    )
  }
}

async function migrateCoupons(rows: Coupon[]) {
  for (const c of rows) {
    await sqlRun(
      `INSERT OR IGNORE INTO coupons
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
}

// ── Check if SQLite already has data ─────────────────────────────────────────

async function sqliteHasData(): Promise<boolean> {
  const rows = await sqlQuery<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM completedSales')
  return (rows[0]?.cnt ?? 0) > 0
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run migration once.
 * If the migration flag is already in localStorage, returns immediately.
 * If SQLite already has data, marks as done and returns.
 * Otherwise, opens the legacy IndexedDB, reads all tables, and inserts into SQLite.
 */
export async function runDexieMigrationIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG) === 'done') return

  // If SQLite already has data from a prior (partial) run, just mark done.
  if (await sqliteHasData()) {
    localStorage.setItem(MIGRATION_FLAG, 'done')
    return
  }

  const legacyDb = await openLegacyDB()
  if (!legacyDb) {
    // No legacy DB found – first-time install, nothing to migrate.
    localStorage.setItem(MIGRATION_FLAG, 'done')
    return
  }

  try {
    console.log('[Migration] Starting Dexie → SQLite migration…')

    const [
      completedSales, savedOrders, settings, printerSettings,
      cart, counters, productStats, productPairs, suggestionMeta, coupons,
    ] = await Promise.all([
      readTable<CompletedSale>(legacyDb, 'completedSales'),
      readTable<SavedOrder>(legacyDb, 'savedOrders'),
      readTable<AppSettings & { id: string }>(legacyDb, 'settings'),
      readTable<PrinterSettings & { id: string }>(legacyDb, 'printerSettings'),
      readTable<CartSnapshot & { id: string }>(legacyDb, 'cart'),
      readTable<{ id: string; invoiceSequence: number; orderSequence: number; salesCount?: number; latestCompletedAt?: number }>(legacyDb, 'counters'),
      readTable<ProductStat>(legacyDb, 'productStats'),
      readTable<ProductPairStat>(legacyDb, 'productPairs'),
      readTable<{ id: string; fingerprint: string; rebuiltAt: number }>(legacyDb, 'suggestionMeta'),
      readTable<Coupon>(legacyDb, 'coupons'),
    ])

    legacyDb.close()

    await migrateSettings(settings)
    await migratePrinterSettings(printerSettings)
    await migrateCart(cart)
    await migrateCounters(counters)
    await migrateSavedOrders(savedOrders)
    await migrateCompletedSales(completedSales)
    await migrateProductStats(productStats)
    await migrateProductPairs(productPairs)
    await migrateSuggestionMeta(suggestionMeta)
    await migrateCoupons(coupons)

    localStorage.setItem(MIGRATION_FLAG, 'done')
    console.log(
      `[Migration] Done. Migrated ${completedSales.length} sales, ` +
      `${savedOrders.length} orders, ${productStats.length} product stats.`
    )
  } catch (err) {
    console.error('[Migration] Error during Dexie → SQLite migration:', err)
    // Don't set the flag – will retry on next load.
    legacyDb.close()
  }
}
