import { db } from './database'

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
  }
}

/**
 * Generate a complete BackupData object from all IndexedDB tables.
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
  ] = await Promise.all([
    db.completedSales.toArray(),
    db.savedOrders.toArray(),
    db.settings.toArray(),
    db.printerSettings.toArray(),
    db.cart.toArray(),
    db.counters.toArray(),
    db.productStats.toArray(),
    db.productPairs.toArray(),
    db.suggestionMeta.toArray(),
  ])

  return {
    version: 1,
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
 * Export all IndexedDB tables into a single JSON backup file and trigger a download.
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
  ] as const

  for (const table of requiredTables) {
    if (!Array.isArray(data.tables[table])) {
      // Allow missing tables — treat as empty
      data.tables[table] = []
    }
  }

  return data
}

/**
 * Import a backup file, replacing all existing data.
 * Returns a summary of what was imported.
 */
export async function importBackup(file: File): Promise<{
  salesCount: number
  ordersCount: number
  productsCount: number
}> {
  const content = await file.text()
  const backup = parseBackupFile(content)

  // Use a transaction to replace all data atomically
  const allTables = [
    db.completedSales,
    db.savedOrders,
    db.settings,
    db.printerSettings,
    db.cart,
    db.counters,
    db.productStats,
    db.productPairs,
    db.suggestionMeta,
  ]
  await db.transaction('rw', allTables, async () => {
      // Clear all tables
      await Promise.all([
        db.completedSales.clear(),
        db.savedOrders.clear(),
        db.settings.clear(),
        db.printerSettings.clear(),
        db.cart.clear(),
        db.counters.clear(),
        db.productStats.clear(),
        db.productPairs.clear(),
        db.suggestionMeta.clear(),
      ])

      // Import all data
      const t = backup.tables
      if (t.completedSales.length > 0) await db.completedSales.bulkPut(t.completedSales as never[])
      if (t.savedOrders.length > 0) await db.savedOrders.bulkPut(t.savedOrders as never[])
      if (t.settings.length > 0) await db.settings.bulkPut(t.settings as never[])
      if (t.printerSettings.length > 0) await db.printerSettings.bulkPut(t.printerSettings as never[])
      if (t.cart.length > 0) await db.cart.bulkPut(t.cart as never[])
      if (t.counters.length > 0) await db.counters.bulkPut(t.counters as never[])
      if (t.productStats.length > 0) await db.productStats.bulkPut(t.productStats as never[])
      if (t.productPairs.length > 0) await db.productPairs.bulkPut(t.productPairs as never[])
      if (t.suggestionMeta.length > 0) await db.suggestionMeta.bulkPut(t.suggestionMeta as never[])
    },
  )

  return {
    salesCount: backup.tables.completedSales.length,
    ordersCount: backup.tables.savedOrders.length,
    productsCount: backup.tables.productStats.length,
  }
}
