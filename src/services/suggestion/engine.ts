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
  priceSimilarity,
  quantityScore,
  recencyScore,
  strengthFor,
} from './scoring'

const RECENCY_DECAY_ON_LEARN = 0.97

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

export class ProductSuggestionEngine {
  private stats = new Map<string, ProductStat>()
  private pairs = new Map<string, ProductPairStat>()
  private rejected = new Map<string, number>()

  reset(): void {
    this.stats.clear()
    this.pairs.clear()
    this.rejected.clear()
  }

  load(stats: ProductStat[], pairs: ProductPairStat[]): void {
    this.reset()
    for (const stat of stats)
      this.stats.set(stat.productKey, {
        ...stat,
        observationCount: stat.observationCount ?? Math.max(1, Math.round(stat.totalCount)),
        priceBuckets: [...stat.priceBuckets],
      })
    for (const pair of pairs) this.pairs.set(pair.id, { ...pair })
  }

  snapshot(): { stats: ProductStat[]; pairs: ProductPairStat[] } {
    return {
      stats: [...this.stats.values()].map((stat) => ({ ...stat, priceBuckets: [...stat.priceBuckets] })),
      pairs: [...this.pairs.values()].map((pair) => ({ ...pair })),
    }
  }

  getKnownProducts(): { productKey: string; displayName: string }[] {
    return [...this.stats.values()]
      .filter((stat) => stat.totalCount > 0)
      .sort((a, b) => b.lastSoldAt - a.lastSoldAt)
      .map((stat) => ({ productKey: stat.productKey, displayName: stat.displayName }))
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
      }
      return
    }

    const displayName = formatDisplayName(productName)
    const current = this.stats.get(key) ?? emptyStat(key, displayName, observation.soldAt)
    const weight = Math.max(0.25, observation.weight)

    current.displayName = displayName
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

    for (const companion of observation.companionKeys ?? []) {
      if (!companion || companion === key) continue
      const id = pairId(key, companion)
      const pair = this.pairs.get(id) ?? { id, count: 0, lastSeenAt: observation.soldAt }
      pair.count += weight
      pair.lastSeenAt = observation.soldAt
      this.pairs.set(id, pair)
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
    if (current.totalCount < 0.5 || current.observationCount <= 0) this.stats.delete(key)
    else this.stats.set(key, current)
  }

  suggest(query: SuggestionQuery): SuggestionResult {
    if (query.unitPricePaise <= 0 || query.quantity <= 0 || this.stats.size === 0) {
      return { best: null, alternatives: [] }
    }

    const now = query.now ?? Date.now()
    const hasCartContext = query.cartProductKeys.length > 0

    const priceMatched: { stat: ProductStat; price: number }[] = []
    for (const stat of this.stats.values()) {
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
