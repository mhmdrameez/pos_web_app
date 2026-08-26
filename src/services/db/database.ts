import Dexie, { type Table } from 'dexie'
import type {
  AppSettings,
  CartSnapshot,
  CompletedSale,
  PrinterSettings,
  SavedOrder,
} from '../../types'
import type { ProductPairStat, ProductStat } from '../../types/suggestion'

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
    // IndexedDB remains the primary local store if browser storage is unavailable or full.
  }
}

class QuickSaleDB extends Dexie {
  savedOrders!: Table<SavedOrder>
  completedSales!: Table<CompletedSale>
  settings!: Table<AppSettings & { id: string }>
  printerSettings!: Table<PrinterSettings & { id: string }>
  cart!: Table<CartSnapshot & { id: string }>
  counters!: Table<{ id: string; invoiceSequence: number; orderSequence: number; salesCount?: number; latestCompletedAt?: number }>
  productStats!: Table<ProductStat>
  productPairs!: Table<ProductPairStat>
  suggestionMeta!: Table<{ id: string; fingerprint: string; rebuiltAt: number }>

  constructor() {
    super('QuickSalePOS')
    this.version(1).stores({
      savedOrders: 'id, orderNumber, status, createdAt, updatedAt',
      completedSales: 'id, invoiceNumber, completedAt, status',
      settings: 'id',
      printerSettings: 'id',
      cart: 'id',
      counters: 'id',
    })
    this.version(2).stores({
      savedOrders: 'id, orderNumber, status, createdAt, updatedAt',
      completedSales: 'id, invoiceNumber, completedAt, status',
      settings: 'id',
      printerSettings: 'id',
      cart: 'id',
      counters: 'id',
      productStats: 'productKey, lastSoldAt',
      productPairs: 'id',
      suggestionMeta: 'id',
    })
    // v3: salesCount/latestCompletedAt added to counters (no schema change needed,
    // they are extra non-indexed fields on the existing 'id' key).
    this.version(3).stores({
      savedOrders: 'id, orderNumber, status, createdAt, updatedAt',
      completedSales: 'id, invoiceNumber, completedAt, status',
      settings: 'id',
      printerSettings: 'id',
      cart: 'id',
      counters: 'id',
      productStats: 'productKey, lastSoldAt',
      productPairs: 'id',
      suggestionMeta: 'id',
    })
  }
}

export const db = new QuickSaleDB()

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('default')
  return row ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ id: 'default', ...settings })
}

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const row = await db.printerSettings.get('default')
  return row ?? DEFAULT_PRINTER
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await db.printerSettings.put({ id: 'default', ...settings })
}

export async function getCartSnapshot(): Promise<CartSnapshot> {
  const row = await db.cart.get('current')
  return row ?? DEFAULT_CART
}

export async function saveCartSnapshot(cart: CartSnapshot): Promise<void> {
  await db.cart.put({ id: 'current', ...cart })
}

export async function getSavedOrders(): Promise<SavedOrder[]> {
  return db.savedOrders.where('status').equals('draft').reverse().sortBy('updatedAt')
}

export async function saveOrder(order: SavedOrder): Promise<void> {
  await db.savedOrders.put(order)
}

export async function getSavedOrder(id: string): Promise<SavedOrder | undefined> {
  return db.savedOrders.get(id)
}

export async function deleteSavedOrder(id: string): Promise<void> {
  await db.savedOrders.delete(id)
}

export async function getCompletedSales(): Promise<CompletedSale[]> {
  const sales = await db.completedSales.orderBy('completedAt').reverse().toArray()
  if (sales.length > 0) {
    saveCompletedSalesBackup(sales)
    return sales
  }

  const backup = getCompletedSalesBackup()
  if (backup.length > 0) {
    await db.completedSales.bulkPut(backup)
    return backup.sort((a, b) => b.completedAt - a.completedAt)
  }

  return []
}

export async function getCompletedSale(id: string): Promise<CompletedSale | undefined> {
  return db.completedSales.get(id)
}

export async function saveCompletedSale(sale: CompletedSale): Promise<void> {
  await db.completedSales.put(sale)
  const sales = getCompletedSalesBackup().filter((storedSale) => storedSale.id !== sale.id)
  sales.unshift(sale)
  saveCompletedSalesBackup(sales)

  // Incrementally update the sales counter for fast fingerprinting
  try {
    const counter = await db.counters.get('default')
    if (counter) {
      await db.counters.update('default', {
        salesCount: (counter.salesCount ?? 0) + 1,
        latestCompletedAt: Math.max(counter.latestCompletedAt ?? 0, sale.completedAt),
      })
    }
  } catch {
    // Non-critical — fingerprint will fall back to full scan
  }
}

export async function getSalesByDateRange(
  fromTs: number,
  toTs: number,
): Promise<CompletedSale[]> {
  return db.completedSales
    .where('completedAt')
    .between(fromTs, toTs, true, true)
    .reverse()
    .sortBy('completedAt')
}

export async function markEmailSent(saleId: string, sentAt: number): Promise<void> {
  await db.completedSales.where('id').equals(saleId).modify({ emailSentAt: sentAt })
  // Update backup too
  const backup = getCompletedSalesBackup().map((s) =>
    s.id === saleId ? { ...s, emailSentAt: sentAt } : s,
  )
  saveCompletedSalesBackup(backup)
}

export async function cancelCompletedSale(id: string): Promise<void> {
  const sale = await db.completedSales.get(id)
  if (!sale) {
    throw new Error('Sale not found')
  }
  if (sale.status === 'cancelled') {
    return
  }

  const updated: CompletedSale = {
    ...sale,
    status: 'cancelled',
    updatedAt: Date.now(),
  }

  await db.completedSales.put(updated)

  const backup = getCompletedSalesBackup().map((s) => (s.id === id ? updated : s))
  saveCompletedSalesBackup(backup)

  await decrementSalesCounter()

  const { forgetCompletedSale, persistSuggestionSnapshot } = await import('../suggestion')
  forgetCompletedSale(sale)
  await persistSuggestionSnapshot()
}

export async function getNextInvoiceNumber(): Promise<string> {
  const counter = await db.counters.get('default')
  const next = (counter?.invoiceSequence ?? 0) + 1
  await db.counters.put({
    id: 'default',
    invoiceSequence: next,
    orderSequence: counter?.orderSequence ?? 0,
  })
  return `INV-${next.toString().padStart(6, '0')}`
}

export async function getSuggestionMeta(): Promise<{ fingerprint: string; rebuiltAt: number } | undefined> {
  const row = await db.suggestionMeta.get('default')
  if (!row) return undefined
  return { fingerprint: row.fingerprint, rebuiltAt: row.rebuiltAt }
}

export async function saveSuggestionIndex(
  stats: ProductStat[],
  pairs: ProductPairStat[],
  fingerprint: string,
): Promise<void> {
  await db.transaction('rw', db.productStats, db.productPairs, db.suggestionMeta, async () => {
    await db.productStats.clear()
    await db.productPairs.clear()
    if (stats.length > 0) await db.productStats.bulkPut(stats)
    if (pairs.length > 0) await db.productPairs.bulkPut(pairs)
    await db.suggestionMeta.put({ id: 'default', fingerprint, rebuiltAt: Date.now() })
  })
}

/** Incrementally save only the changed stats/pairs instead of clearing and rewriting everything. */
export async function incrementalSaveSuggestionStats(
  stats: ProductStat[],
  pairs: ProductPairStat[],
  deletedStatKeys: string[],
  fingerprint: string,
): Promise<void> {
  await db.transaction('rw', db.productStats, db.productPairs, db.suggestionMeta, async () => {
    if (stats.length > 0) await db.productStats.bulkPut(stats)
    if (pairs.length > 0) await db.productPairs.bulkPut(pairs)
    if (deletedStatKeys.length > 0) await db.productStats.bulkDelete(deletedStatKeys)
    await db.suggestionMeta.put({ id: 'default', fingerprint, rebuiltAt: Date.now() })
  })
}

/** Update just the fingerprint/meta without touching stats or pairs. */
export async function saveSuggestionFingerprint(fingerprint: string): Promise<void> {
  await db.suggestionMeta.put({ id: 'default', fingerprint, rebuiltAt: Date.now() })
}

export async function loadSuggestionIndex(): Promise<{ stats: ProductStat[]; pairs: ProductPairStat[] }> {
  const [stats, pairs] = await Promise.all([db.productStats.toArray(), db.productPairs.toArray()])
  return { stats, pairs }
}

export async function upsertProductStat(stat: ProductStat): Promise<void> {
  await db.productStats.put(stat)
}

export async function upsertProductPair(pair: ProductPairStat): Promise<void> {
  await db.productPairs.put(pair)
}

/**
 * O(1) fingerprint from stored counters. Falls back to full scan if counters
 * haven't been populated yet (first run after migration to v3).
 */
export async function computeSalesFingerprintFast(): Promise<string> {
  const counter = await db.counters.get('default')
  if (counter && counter.salesCount != null && counter.salesCount > 0) {
    return `${counter.salesCount}:${counter.latestCompletedAt ?? 0}`
  }
  // Fallback: full scan + initialize counters for next time
  return computeSalesFingerprint()
}

/** Full O(N) scan — used only as fallback and during full rebuild. Also seeds the counters. */
export async function computeSalesFingerprint(): Promise<string> {
  let count = 0
  let latest = 0
  await db.completedSales.each((sale) => {
    if (sale.status === 'cancelled') return
    count += 1
    latest = Math.max(latest, sale.completedAt)
  })
  // Seed the counter so future calls can use the fast path
  try {
    const counter = await db.counters.get('default')
    if (counter) {
      await db.counters.update('default', { salesCount: count, latestCompletedAt: latest })
    }
  } catch {
    // Non-critical
  }
  return `${count}:${latest}`
}

export async function initializeDatabase(): Promise<void> {
  const settings = await db.settings.get('default')
  if (!settings) {
    await db.settings.put({ id: 'default', ...DEFAULT_SETTINGS })
  }
  const printer = await db.printerSettings.get('default')
  if (!printer) {
    await db.printerSettings.put({ id: 'default', ...DEFAULT_PRINTER })
  }
  const counter = await db.counters.get('default')
  if (!counter) {
    await db.counters.put({ id: 'default', invoiceSequence: 0, orderSequence: 0, salesCount: 0, latestCompletedAt: 0 })
  } else if (counter.salesCount == null) {
    // Migrate existing counter row to include sales tracking fields
    await db.counters.update('default', { salesCount: 0, latestCompletedAt: 0 })
  }
}

/** Decrement the sales counter (used when cancelling a sale). */
export async function decrementSalesCounter(): Promise<void> {
  try {
    const counter = await db.counters.get('default')
    if (counter && counter.salesCount != null && counter.salesCount > 0) {
      await db.counters.update('default', {
        salesCount: counter.salesCount - 1,
      })
    }
  } catch {
    // Non-critical
  }
}
