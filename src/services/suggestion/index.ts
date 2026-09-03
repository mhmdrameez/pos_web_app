import type { CartItem, CompletedSale } from '../../types'
import type { LearnObservation, LineNameSource } from '../../types/suggestion'
import {
  getCompletedSales,
  computeSalesFingerprintFast,
  computeSalesFingerprint,
  getSuggestionMeta,
  loadSuggestionIndex,
  saveSuggestionIndex,
  incrementalSaveSuggestionStats,
} from '../db/database'
import { productSuggestionEngine } from './engine'
import { normalizeProductKey, productNameFromLine } from './productName'
import { ACCEPTED_LEARN_WEIGHT, MANUAL_LEARN_WEIGHT, SUGGESTED_LEARN_WEIGHT } from './scoring'

/** Number of sales to process per batch during rebuild, to avoid blocking the main thread. */
const REBUILD_BATCH_SIZE = 200

function sourceWeight(source: LineNameSource | undefined, name: string): number | null {
  if (!productNameFromLine(name)) return null
  if (source === 'manual') return MANUAL_LEARN_WEIGHT
  if (source === 'suggested') return ACCEPTED_LEARN_WEIGHT
  return SUGGESTED_LEARN_WEIGHT
}

function observationsFromSale(sale: CompletedSale): LearnObservation[] {
  if (sale.status === 'cancelled') return []
  const namedKeys = sale.items
    .map((item) => productNameFromLine(item.name))
    .filter((key): key is string => Boolean(key))
    .map((name) => normalizeProductKey(name))

  return sale.items.flatMap((item) => {
    const productName = productNameFromLine(item.name)
    if (!productName) return []
    const weight = sourceWeight(item.nameSource, item.name)
    if (weight == null) return []
    return [
      {
        displayName: productName,
        unitPricePaise: item.unitPricePaise,
        quantity: item.quantity,
        soldAt: sale.completedAt,
        weight,
        source: item.nameSource === 'manual' || item.nameSource === 'suggested' ? item.nameSource : 'auto',
        companionKeys: namedKeys.filter((key) => key !== normalizeProductKey(productName)),
      },
    ]
  })
}

export function ingestCompletedSale(sale: CompletedSale): void {
  for (const observation of observationsFromSale(sale)) {
    productSuggestionEngine.learn(observation)
  }
}

export function forgetCompletedSale(sale: CompletedSale): void {
  for (const observation of observationsFromSale({ ...sale, status: 'completed' })) {
    productSuggestionEngine.unlearn(observation)
  }
}

/** Yield to the main thread so the UI stays responsive during long operations. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Rebuild the entire suggestion index from all completed sales.
 * Processes in batches with yielding so the main thread doesn't freeze.
 */
export async function rebuildProductSuggestionIndex(): Promise<void> {
  productSuggestionEngine.reset()

  // Collect all sale IDs first, then process in batches
  const allSales = await getCompletedSales()
  for (let i = 0; i < allSales.length; i += REBUILD_BATCH_SIZE) {
    const batch = allSales.slice(i, i + REBUILD_BATCH_SIZE)
    for (const sale of batch) {
      ingestCompletedSale(sale)
    }
    // Yield between batches so the browser doesn't lock up
    if (i + REBUILD_BATCH_SIZE < allSales.length) {
      await yieldToMain()
    }
  }

  const snapshot = productSuggestionEngine.snapshot()
  const fingerprint = await computeSalesFingerprint()
  await saveSuggestionIndex(snapshot.stats, snapshot.pairs, fingerprint)
  productSuggestionEngine.clearDirty()
}

export async function ensureProductSuggestionIndex(): Promise<void> {
  const fingerprint = await computeSalesFingerprintFast()
  const meta = await getSuggestionMeta()
  if (meta?.fingerprint === fingerprint) {
    const stored = await loadSuggestionIndex()
    productSuggestionEngine.load(stored.stats, stored.pairs)
    if (productSuggestionEngine.hasDirty()) {
      const snapshot = productSuggestionEngine.snapshot()
      await saveSuggestionIndex(snapshot.stats, snapshot.pairs, fingerprint)
      productSuggestionEngine.clearDirty()
    }
    if (productSuggestionEngine.getAllProductStats().length > 0 || fingerprint === '0:0') return
  }
  await rebuildProductSuggestionIndex()
}

/**
 * Persist only the stats/pairs that changed since the last persist.
 * Falls back to full snapshot if nothing is dirty (no-op).
 */
export async function persistSuggestionSnapshot(): Promise<void> {
  const fingerprint = await computeSalesFingerprintFast()

  if (!productSuggestionEngine.hasDirty()) {
    // Nothing changed in memory — just update the fingerprint if needed
    return
  }

  const { stats, pairs, deletedStatKeys } = productSuggestionEngine.getDirtySnapshot()
  await incrementalSaveSuggestionStats(stats, pairs, deletedStatKeys, fingerprint)
  productSuggestionEngine.clearDirty()
}

export function cartProductKeys(items: CartItem[]): string[] {
  return items
    .map((item) => productNameFromLine(item.name))
    .filter((name): name is string => Boolean(name))
    .map((name) => normalizeProductKey(name))
}

export function findProductByName(displayName: string) {
  const key = normalizeProductKey(displayName)
  if (!key) return undefined
  return productSuggestionEngine.getAllProductStats().find((stat) => stat.productKey === key)
}

export async function addManualProduct(
  displayName: string,
  unitPricePaise: number,
  quantity = 1,
): Promise<{ merged: boolean; displayName: string }> {
  const existing = findProductByName(displayName)
  productSuggestionEngine.learn({
    displayName,
    unitPricePaise,
    quantity,
    soldAt: Date.now(),
    weight: MANUAL_LEARN_WEIGHT,
    source: 'manual',
  })
  await persistSuggestionSnapshot()
  const saved = findProductByName(displayName)
  return { merged: Boolean(existing), displayName: saved?.displayName ?? displayName }
}

export async function removeManualProduct(productKey: string): Promise<void> {
  productSuggestionEngine.removeProduct(productKey)
  await persistSuggestionSnapshot()
}

export function getKnownProductStats() {
  return productSuggestionEngine.getAllProductStats()
}

/** Merge catalog rows that only differ by case, spacing, or punctuation, then persist. */
export async function mergeDuplicateProducts(): Promise<number> {
  const before = productSuggestionEngine.snapshot().stats.length
  const snapshot = productSuggestionEngine.snapshot()
  productSuggestionEngine.load(snapshot.stats, snapshot.pairs)
  const after = productSuggestionEngine.snapshot().stats.length
  if (productSuggestionEngine.hasDirty()) {
    const fingerprint = await computeSalesFingerprintFast()
    const next = productSuggestionEngine.snapshot()
    await saveSuggestionIndex(next.stats, next.pairs, fingerprint)
    productSuggestionEngine.clearDirty()
  }
  return Math.max(0, before - after)
}


