import type { CartItem, CompletedSale } from '../../types'
import type { LearnObservation, LineNameSource } from '../../types/suggestion'
import {
  db,
  computeSalesFingerprint,
  getSuggestionMeta,
  loadSuggestionIndex,
  saveSuggestionIndex,
} from '../db/database'
import { productSuggestionEngine } from './engine'
import { isGenericLineName, normalizeProductKey } from './productName'
import { ACCEPTED_LEARN_WEIGHT, MANUAL_LEARN_WEIGHT, SUGGESTED_LEARN_WEIGHT } from './scoring'

function sourceWeight(source: LineNameSource | undefined, name: string): number | null {
  if (isGenericLineName(name)) return null
  if (source === 'manual') return MANUAL_LEARN_WEIGHT
  if (source === 'suggested') return ACCEPTED_LEARN_WEIGHT
  return SUGGESTED_LEARN_WEIGHT
}

function observationsFromSale(sale: CompletedSale): LearnObservation[] {
  if (sale.status === 'cancelled') return []
  const namedKeys = sale.items
    .filter((item) => !isGenericLineName(item.name))
    .map((item) => normalizeProductKey(item.name))

  return sale.items.flatMap((item) => {
    const weight = sourceWeight(item.nameSource, item.name)
    if (weight == null) return []
    return [
      {
        displayName: item.name,
        unitPricePaise: item.unitPricePaise,
        quantity: item.quantity,
        soldAt: sale.completedAt,
        weight,
        source: item.nameSource === 'manual' || item.nameSource === 'suggested' ? item.nameSource : 'auto',
        companionKeys: namedKeys.filter((key) => key !== normalizeProductKey(item.name)),
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

export async function rebuildProductSuggestionIndex(): Promise<void> {
  productSuggestionEngine.reset()
  await db.completedSales.each((sale) => {
    ingestCompletedSale(sale)
  })
  const snapshot = productSuggestionEngine.snapshot()
  const fingerprint = await computeSalesFingerprint()
  await saveSuggestionIndex(snapshot.stats, snapshot.pairs, fingerprint)
}

export async function ensureProductSuggestionIndex(): Promise<void> {
  const fingerprint = await computeSalesFingerprint()
  const meta = await getSuggestionMeta()
  if (meta?.fingerprint === fingerprint) {
    const stored = await loadSuggestionIndex()
    productSuggestionEngine.load(stored.stats, stored.pairs)
    if (stored.stats.length > 0 || fingerprint === '0:0') return
  }
  await rebuildProductSuggestionIndex()
}

export async function persistSuggestionSnapshot(): Promise<void> {
  const snapshot = productSuggestionEngine.snapshot()
  const fingerprint = await computeSalesFingerprint()
  await saveSuggestionIndex(snapshot.stats, snapshot.pairs, fingerprint)
}

export function cartProductKeys(items: CartItem[]): string[] {
  return items
    .filter((item) => !isGenericLineName(item.name))
    .map((item) => normalizeProductKey(item.name))
}
