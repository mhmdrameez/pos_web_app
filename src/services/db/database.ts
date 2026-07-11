import Dexie, { type Table } from 'dexie'
import type {
  AppSettings,
  CartSnapshot,
  CompletedSale,
  PrinterSettings,
  SavedOrder,
} from '../../types'

const DEFAULT_SETTINGS: AppSettings = {
  businessName: 'My Business',
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

class QuickSaleDB extends Dexie {
  savedOrders!: Table<SavedOrder>
  completedSales!: Table<CompletedSale>
  settings!: Table<AppSettings & { id: string }>
  printerSettings!: Table<PrinterSettings & { id: string }>
  cart!: Table<CartSnapshot & { id: string }>
  counters!: Table<{ id: string; invoiceSequence: number; orderSequence: number }>

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
  return db.completedSales.orderBy('completedAt').reverse().toArray()
}

export async function saveCompletedSale(sale: CompletedSale): Promise<void> {
  await db.completedSales.put(sale)
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
    await db.counters.put({ id: 'default', invoiceSequence: 0, orderSequence: 0 })
  }
}
