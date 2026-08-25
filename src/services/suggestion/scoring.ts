import type { InferredUnit, PriceBucket, ProductStat, SuggestionWeights } from '../../types/suggestion'

export const SUGGESTION_WEIGHTS: SuggestionWeights = {
  price: 0.35,
  frequency: 0.25,
  quantity: 0.15,
  recency: 0.15,
  association: 0.1,
}

export const MIN_CONFIDENCE = 0.55
export const STRONG_CONFIDENCE = 0.8
export const MIN_OBSERVATIONS = 1
export const MIN_PRICE_SIMILARITY = 0.45
export const RECENCY_HALF_LIFE_DAYS = 21
export const MAX_PRICE_BUCKETS = 24
export const MANUAL_LEARN_WEIGHT = 3
export const ACCEPTED_LEARN_WEIGHT = 2
export const SUGGESTED_LEARN_WEIGHT = 1

export function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function priceBucketKey(paise: number): number {
  return Math.round(paise / 100) * 100
}

export function inferUnit(stat: ProductStat): InferredUnit {
  const total = stat.integerQtyCount + stat.decimalQtyCount
  if (total < MIN_OBSERVATIONS) return 'unknown'
  if (stat.decimalQtyCount / total >= 0.6) return 'meter'
  if (stat.integerQtyCount / total >= 0.6) return 'piece'
  return 'unknown'
}

export function unitLabel(unit: InferredUnit): string {
  if (unit === 'meter') return 'm'
  if (unit === 'piece') return 'pc'
  if (unit === 'kilogram') return 'kg'
  if (unit === 'litre') return 'L'
  return ''
}

export function priceSimilarity(pricePaise: number, stat: ProductStat): number {
  if (stat.totalCount <= 0) return 0
  const mean = stat.sumPricePaise / stat.totalCount
  const variance = Math.max(0, stat.sumPriceSq / stat.totalCount - mean * mean)
  const sigma = Math.max(Math.sqrt(variance), 150, mean * 0.08)
  const gaussian = Math.exp(-0.5 * ((pricePaise - mean) / sigma) ** 2)

  const paddedMin = stat.minPricePaise - sigma
  const paddedMax = stat.maxPricePaise + sigma
  const inRangeBoost = pricePaise >= paddedMin && pricePaise <= paddedMax ? 1 : 0.35

  const bucket = priceBucketKey(pricePaise)
  const maxBucket = stat.priceBuckets.reduce((max, item) => Math.max(max, item.count), 1)
  const thisBucket = stat.priceBuckets.find((item) => item.paise === bucket)?.count ?? 0
  const bucketScore = thisBucket / maxBucket

  return clamp01(0.55 * gaussian + 0.25 * inRangeBoost + 0.2 * bucketScore)
}

export function frequencyScore(stat: ProductStat, maxEffective: number): number {
  const effective = stat.confirmedCount * 2 + stat.totalCount
  if (maxEffective <= 0 || effective <= 0) return 0
  return clamp01(Math.log1p(effective) / Math.log1p(maxEffective))
}

export function quantityScore(quantity: number, stat: ProductStat): number {
  const total = stat.integerQtyCount + stat.decimalQtyCount
  if (total <= 0) return 0.5
  const kindCount = Number.isInteger(quantity) ? stat.integerQtyCount : stat.decimalQtyCount
  return clamp01(0.35 + 0.65 * (kindCount / total))
}

export function recencyScore(stat: ProductStat, now: number, maxRecency: number): number {
  const ageDays = Math.max(0, (now - stat.lastSoldAt) / 86_400_000)
  const decay = 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS)
  const mass = stat.recencyMass * decay
  if (maxRecency <= 0) return 0
  return clamp01(Math.log1p(mass) / Math.log1p(maxRecency))
}

export function associationScore(pairCount: number, candidateCount: number): number {
  if (candidateCount <= 0 || pairCount <= 0) return 0
  return clamp01(pairCount / candidateCount)
}

export function combineScores(
  parts: { price: number; frequency: number; quantity: number; recency: number; association: number },
  hasCartContext: boolean,
  weights: SuggestionWeights = SUGGESTION_WEIGHTS,
): number {
  if (!hasCartContext) {
    const rest = weights.price + weights.frequency + weights.quantity + weights.recency
    return clamp01(
      (weights.price / rest) * parts.price +
        (weights.frequency / rest) * parts.frequency +
        (weights.quantity / rest) * parts.quantity +
        (weights.recency / rest) * parts.recency,
    )
  }

  return clamp01(
    weights.price * parts.price +
      weights.frequency * parts.frequency +
      weights.quantity * parts.quantity +
      weights.recency * parts.recency +
      weights.association * parts.association,
  )
}

export function strengthFor(confidence: number) {
  if (confidence < MIN_CONFIDENCE) return 'none' as const
  if (confidence < STRONG_CONFIDENCE) return 'maybe' as const
  return 'suggested' as const
}

export function mergePriceBucket(buckets: PriceBucket[], paise: number, weight: number): PriceBucket[] {
  const key = priceBucketKey(paise)
  const next = buckets.map((bucket) =>
    bucket.paise === key ? { ...bucket, count: bucket.count + weight } : bucket,
  )
  if (!next.some((bucket) => bucket.paise === key)) {
    next.push({ paise: key, count: weight })
  }
  return next.sort((a, b) => b.count - a.count).slice(0, MAX_PRICE_BUCKETS)
}

export function effectiveLearnWeight(stat: Pick<ProductStat, 'totalCount' | 'confirmedCount'>): number {
  return stat.confirmedCount * 2 + stat.totalCount
}
