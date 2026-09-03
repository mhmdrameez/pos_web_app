import type {
  LearnObservation,
  ProductPairStat,
  ProductStat,
  RankedSuggestion,
  SuggestionQuery,
  SuggestionResult,
} from '../../types/suggestion'
import {
  autoLineName,
  formatDisplayName,
  normalizeProductKey,
  pairId,
  productNameFromLine,
  quantityKind,
} from './productName'
import {
  ACCEPTED_LEARN_WEIGHT,
  MANUAL_LEARN_WEIGHT,
  MIN_OBSERVATIONS,
  MIN_PRICE_SIMILARITY,
  RECENCY_HALF_LIFE_DAYS,
  SUGGESTED_LEARN_WEIGHT,
  associationScore,
  combineScores,
  effectiveLearnWeight,
  frequencyScore,
  inferUnit,
  mergePriceBucket,
  priceBucketKey,
  priceSimilarity,
  quantityScore,
  recencyScore,
  strengthFor,
} from './scoring'

const RECENCY_DECAY_ON_LEARN = 0.97

/** Number of adjacent price buckets to scan in each direction during suggest(). */
const PRICE_INDEX_RADIUS = 3

function emptyStat(productKey: string, displayName: string, soldAt: number): ProductStat {
  return {
    productKey,
    displayName,
    totalCount: 0,
    confirmedCount: 0,
    rejectedCount: 0,
    minPricePaise: Number.POSITIVE_INFINITY,
    maxPricePaise: 0,
    sumPricePaise: 0,
    sumPriceSq: 0,
    integerQtyCount: 0,
    decimalQtyCount: 0,
    lastSoldAt: soldAt,
    recencyMass: 0,
    observationCount: 0,
    priceBuckets: [],
  }
}

function preferDisplayName(current: string, incoming: string): string {
  const a = formatDisplayName(current)
  const b = formatDisplayName(incoming)
  if (b.length > a.length) return b
  return a
}

function mergeProductStats(into: ProductStat, from: ProductStat): ProductStat {
  let buckets = [...into.priceBuckets]
  for (const bucket of from.priceBuckets) {
    buckets = mergePriceBucket(buckets, bucket.paise, bucket.count)
  }
  return {
    productKey: into.productKey,
    displayName: preferDisplayName(into.displayName, from.displayName),
    totalCount: into.totalCount + from.totalCount,
    confirmedCount: into.confirmedCount + from.confirmedCount,
    rejectedCount: into.rejectedCount + from.rejectedCount,
    minPricePaise: Math.min(into.minPricePaise, from.minPricePaise),
    maxPricePaise: Math.max(into.maxPricePaise, from.maxPricePaise),
    sumPricePaise: into.sumPricePaise + from.sumPricePaise,
    sumPriceSq: into.sumPriceSq + from.sumPriceSq,
    integerQtyCount: into.integerQtyCount + from.integerQtyCount,
    decimalQtyCount: into.decimalQtyCount + from.decimalQtyCount,
    lastSoldAt: Math.max(into.lastSoldAt, from.lastSoldAt),
    recencyMass: into.recencyMass + from.recencyMass,
    observationCount: (into.observationCount ?? 0) + (from.observationCount ?? 0),
    priceBuckets: buckets,
  }
}

export class ProductSuggestionEngine {
  private stats = new Map<string, ProductStat>()
  private pairs = new Map<string, ProductPairStat>()
  private rejected = new Map<string, number>()

  // --- Dirty tracking: only persist what changed since last clearDirty() ---
  private dirtyStats = new Set<string>()
  private dirtyPairs = new Set<string>()

  // --- Price-bucket index: Map<bucketKey, Set<productKey>> for O(1)-ish suggest ---
  private priceIndex = new Map<number, Set<string>>()

  reset(): void {
    this.stats.clear()
    this.pairs.clear()
    this.rejected.clear()
    this.dirtyStats.clear()
    this.dirtyPairs.clear()
    this.priceIndex.clear()
  }

  load(stats: ProductStat[], pairs: ProductPairStat[]): void {
    this.reset()
    const originalKeys = new Set(stats.map((stat) => stat.productKey))

    for (const stat of stats) {
      const key = normalizeProductKey(stat.productKey) || normalizeProductKey(stat.displayName)
      if (!key) continue
      const canonical: ProductStat = {
        ...stat,
        productKey: key,
        displayName: formatDisplayName(stat.displayName),
        observationCount: stat.observationCount ?? Math.max(1, Math.round(stat.totalCount)),
        priceBuckets: [...stat.priceBuckets],
      }
      const existing = this.stats.get(key)
      this.stats.set(key, existing ? mergeProductStats(existing, canonical) : canonical)
    }

    this.priceIndex.clear()
    for (const stat of this.stats.values()) this._addToPriceIndex(stat)

    const canonicalKeys = new Set(this.stats.keys())
    const remapped =
      stats.length !== this.stats.size || [...originalKeys].some((key) => !canonicalKeys.has(key))
    if (remapped) {
      for (const key of canonicalKeys) this.dirtyStats.add(key)
      for (const key of originalKeys) {
        if (!canonicalKeys.has(key)) this.dirtyStats.add(key)
      }
    }

    for (const pair of pairs) {
      const [left, right] = pair.id.split('|')
      if (!left || !right) continue
      const id = pairId(normalizeProductKey(left), normalizeProductKey(right))
      const [a, b] = id.split('|')
      if (!a || !b || a === b) continue
      const existing = this.pairs.get(id)
      if (existing) {
        existing.count += pair.count
        existing.lastSeenAt = Math.max(existing.lastSeenAt, pair.lastSeenAt)
        this.pairs.set(id, existing)
      } else {
        this.pairs.set(id, { id, count: pair.count, lastSeenAt: pair.lastSeenAt })
      }
      if (remapped || pair.id !== id) this.dirtyPairs.add(id)
    }
  }

  snapshot(): { stats: ProductStat[]; pairs: ProductPairStat[] } {
    return {
      stats: [...this.stats.values()].map((stat) => ({ ...stat, priceBuckets: [...stat.priceBuckets] })),
      pairs: [...this.pairs.values()].map((pair) => ({ ...pair })),
    }
  }

  /** Return only the stats and pairs that changed since the last clearDirty(). */
  getDirtySnapshot(): { stats: ProductStat[]; pairs: ProductPairStat[]; deletedStatKeys: string[] } {
    const stats: ProductStat[] = []
    const deletedStatKeys: string[] = []
    for (const key of this.dirtyStats) {
      const stat = this.stats.get(key)
      if (stat) stats.push({ ...stat, priceBuckets: [...stat.priceBuckets] })
      else deletedStatKeys.push(key)
    }
    const pairs: ProductPairStat[] = []
    for (const id of this.dirtyPairs) {
      const pair = this.pairs.get(id)
      if (pair) pairs.push({ ...pair })
    }
    return { stats, pairs, deletedStatKeys }
  }

  /** Returns true if any stats or pairs have been modified since last clearDirty(). */
  hasDirty(): boolean {
    return this.dirtyStats.size > 0 || this.dirtyPairs.size > 0
  }

  clearDirty(): void {
    this.dirtyStats.clear()
    this.dirtyPairs.clear()
  }

  getKnownProducts(): { productKey: string; displayName: string }[] {
    const seen = new Set<string>()
    const products: { productKey: string; displayName: string }[] = []
    for (const stat of [...this.stats.values()]
      .filter((item) => item.totalCount > 0)
      .sort((a, b) => b.lastSoldAt - a.lastSoldAt)) {
      const key = normalizeProductKey(stat.displayName) || stat.productKey
      if (seen.has(key)) continue
      seen.add(key)
      products.push({ productKey: stat.productKey, displayName: stat.displayName })
    }
    return products
  }

  getAllProductStats(): ProductStat[] {
    const seen = new Set<string>()
    const stats: ProductStat[] = []
    for (const stat of [...this.stats.values()]
      .filter((item) => item.totalCount > 0)
      .sort((a, b) => b.lastSoldAt - a.lastSoldAt)) {
      const key = normalizeProductKey(stat.displayName) || stat.productKey
      if (seen.has(key)) continue
      seen.add(key)
      stats.push({ ...stat, priceBuckets: [...stat.priceBuckets] })
    }
    return stats
  }

  removeProduct(productKey: string): void {
    const key = normalizeProductKey(productKey)
    const current = this.stats.get(key)
    if (!current) return
    this._removeFromPriceIndex(current)
    this.stats.delete(key)
    this.dirtyStats.add(key)
  }

  learn(observation: LearnObservation): void {
    const productName = productNameFromLine(observation.displayName)
    if (!productName) return
    const key = normalizeProductKey(productName)

    if (observation.source === 'rejected') {
      this.rejected.set(`${key}:${observation.unitPricePaise}`, (this.rejected.get(`${key}:${observation.unitPricePaise}`) ?? 0) + 1)
      const existing = this.stats.get(key)
      if (existing) {
        existing.rejectedCount += observation.weight
        this.stats.set(key, existing)
        this.dirtyStats.add(key)
      }
      return
    }

    const displayName = formatDisplayName(productName)
    const current = this.stats.get(key) ?? emptyStat(key, displayName, observation.soldAt)
    const weight = Math.max(0.25, observation.weight)

    current.displayName = preferDisplayName(current.displayName, displayName)
    current.totalCount += weight
    if (observation.source === 'manual' || observation.source === 'suggested') {
      current.confirmedCount += observation.source === 'manual' ? weight : weight * 0.5
    }
    current.minPricePaise = Math.min(current.minPricePaise, observation.unitPricePaise)
    current.maxPricePaise = Math.max(current.maxPricePaise, observation.unitPricePaise)
    current.sumPricePaise += observation.unitPricePaise * weight
    current.sumPriceSq += observation.unitPricePaise * observation.unitPricePaise * weight
    if (quantityKind(observation.quantity) === 'integer') current.integerQtyCount += weight
    else current.decimalQtyCount += weight
    current.lastSoldAt = Math.max(current.lastSoldAt, observation.soldAt)
    current.recencyMass = current.recencyMass * RECENCY_DECAY_ON_LEARN + weight
    current.observationCount += 1
    current.priceBuckets = mergePriceBucket(current.priceBuckets, observation.unitPricePaise, weight)
    this.stats.set(key, current)
    this.dirtyStats.add(key)
    this._addToPriceIndex(current)

    for (const companion of observation.companionKeys ?? []) {
      if (!companion || companion === key) continue
      const id = pairId(key, companion)
      const pair = this.pairs.get(id) ?? { id, count: 0, lastSeenAt: observation.soldAt }
      pair.count += weight
      pair.lastSeenAt = observation.soldAt
      this.pairs.set(id, pair)
      this.dirtyPairs.add(id)
    }
  }

  unlearn(observation: LearnObservation): void {
    const key = normalizeProductKey(productNameFromLine(observation.displayName) ?? observation.displayName)
    const current = this.stats.get(key)
    if (!current) return
    const weight = Math.max(0.25, observation.weight)
    current.totalCount = Math.max(0, current.totalCount - weight)
    current.confirmedCount = Math.max(0, current.confirmedCount - (observation.source === 'manual' ? weight : 0))
    current.sumPricePaise = Math.max(0, current.sumPricePaise - observation.unitPricePaise * weight)
    current.sumPriceSq = Math.max(0, current.sumPriceSq - observation.unitPricePaise * observation.unitPricePaise * weight)
    if (quantityKind(observation.quantity) === 'integer') {
      current.integerQtyCount = Math.max(0, current.integerQtyCount - weight)
    } else {
      current.decimalQtyCount = Math.max(0, current.decimalQtyCount - weight)
    }
    current.observationCount = Math.max(0, (current.observationCount ?? 1) - 1)
    if (current.totalCount < 0.5 || current.observationCount <= 0) {
      this._removeFromPriceIndex(current)
      this.stats.delete(key)
    } else {
      this.stats.set(key, current)
    }
    this.dirtyStats.add(key)
  }

  suggest(query: SuggestionQuery): SuggestionResult {
    if (query.unitPricePaise <= 0 || query.quantity <= 0 || this.stats.size === 0) {
      return { best: null, alternatives: [] }
    }

    const now = query.now ?? Date.now()
    const hasCartContext = query.cartProductKeys.length > 0

    // Use price-bucket index for fast candidate lookup instead of scanning all stats
    const candidates = this._getCandidatesByPrice(query.unitPricePaise)

    const priceMatched: { stat: ProductStat; price: number }[] = []
    for (const stat of candidates) {
      if (stat.observationCount < MIN_OBSERVATIONS) continue
      const price = priceSimilarity(query.unitPricePaise, stat)
      if (price < MIN_PRICE_SIMILARITY) continue
      priceMatched.push({ stat, price })
    }

    if (priceMatched.length === 0) return { best: null, alternatives: [] }

    let maxEffective = 0
    let maxRecency = 0
    for (const { stat } of priceMatched) {
      maxEffective = Math.max(maxEffective, effectiveLearnWeight(stat))
      const ageDays = Math.max(0, (now - stat.lastSoldAt) / 86_400_000)
      maxRecency = Math.max(maxRecency, stat.recencyMass * 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS))
    }

    const ranked: RankedSuggestion[] = []
    for (const { stat, price } of priceMatched) {
      const rejectHits = this.rejected.get(`${stat.productKey}:${query.unitPricePaise}`) ?? 0
      const breakdown = {
        price,
        frequency: frequencyScore(stat, maxEffective),
        quantity: quantityScore(query.quantity, stat),
        recency: recencyScore(stat, now, maxRecency || 1),
        association: 0,
      }

      if (hasCartContext) {
        let bestPair = 0
        for (const cartKey of query.cartProductKeys) {
          const pair = this.pairs.get(pairId(stat.productKey, cartKey))
          bestPair = Math.max(bestPair, associationScore(pair?.count ?? 0, stat.totalCount))
        }
        breakdown.association = bestPair
      }

      let confidence = combineScores(breakdown, hasCartContext)
      if (rejectHits > 0) confidence *= 1 / (1 + rejectHits)

      const strength = strengthFor(confidence)
      if (strength === 'none') continue

      ranked.push({
        productKey: stat.productKey,
        displayName: stat.displayName,
        confidence,
        strength,
        inferredUnit: inferUnit(stat),
        breakdown,
      })
    }

    ranked.sort((a, b) => b.confidence - a.confidence)
    const best = ranked[0] ?? null
    const alternatives = ranked.slice(1, 6)
    return { best, alternatives }
  }

  // --- Price-bucket index helpers ---

  /** Add all price buckets from a stat to the price index. */
  private _addToPriceIndex(stat: ProductStat): void {
    for (const bucket of stat.priceBuckets) {
      let set = this.priceIndex.get(bucket.paise)
      if (!set) {
        set = new Set()
        this.priceIndex.set(bucket.paise, set)
      }
      set.add(stat.productKey)
    }
  }

  /** Remove all price bucket entries for a stat from the price index. */
  private _removeFromPriceIndex(stat: ProductStat): void {
    for (const bucket of stat.priceBuckets) {
      const set = this.priceIndex.get(bucket.paise)
      if (set) {
        set.delete(stat.productKey)
        if (set.size === 0) this.priceIndex.delete(bucket.paise)
      }
    }
  }

  /**
   * Get candidate stats by looking up adjacent price buckets.
   * Falls back to full scan if the price index is empty (e.g. before first learn).
   */
  private _getCandidatesByPrice(pricePaise: number): ProductStat[] {
    if (this.priceIndex.size === 0) return [...this.stats.values()]

    const bucketKey = priceBucketKey(pricePaise)
    const bucketStep = 100 // priceBucketKey rounds to nearest 100
    const seen = new Set<string>()
    const candidates: ProductStat[] = []

    for (let offset = -PRICE_INDEX_RADIUS; offset <= PRICE_INDEX_RADIUS; offset++) {
      const bucket = bucketKey + offset * bucketStep
      const keys = this.priceIndex.get(bucket)
      if (!keys) continue
      for (const key of keys) {
        if (seen.has(key)) continue
        seen.add(key)
        const stat = this.stats.get(key)
        if (stat) candidates.push(stat)
      }
    }

    return candidates
  }
}

export function learnWeightForSource(source: LearnObservation['source']): number {
  if (source === 'manual') return MANUAL_LEARN_WEIGHT
  if (source === 'suggested') return ACCEPTED_LEARN_WEIGHT
  if (source === 'auto') return SUGGESTED_LEARN_WEIGHT
  return 1
}

export function defaultLineName(unitPricePaise: number, quantity: number): string {
  return autoLineName(unitPricePaise, quantity)
}

export const productSuggestionEngine = new ProductSuggestionEngine()
