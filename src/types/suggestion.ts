export type QuantityKind = 'integer' | 'decimal'

export type InferredUnit = 'piece' | 'meter' | 'kilogram' | 'litre' | 'unknown'

export type LineNameSource = 'auto' | 'suggested' | 'manual'

export type SuggestionStrength = 'none' | 'maybe' | 'suggested'

export interface SuggestionWeights {
  price: number
  frequency: number
  quantity: number
  recency: number
  association: number
}

export interface PriceBucket {
  paise: number
  count: number
}

export interface ProductStat {
  productKey: string
  displayName: string
  totalCount: number
  confirmedCount: number
  rejectedCount: number
  minPricePaise: number
  maxPricePaise: number
  sumPricePaise: number
  sumPriceSq: number
  integerQtyCount: number
  decimalQtyCount: number
  lastSoldAt: number
  recencyMass: number
  observationCount: number
  priceBuckets: PriceBucket[]
}

export interface ProductPairStat {
  id: string
  count: number
  lastSeenAt: number
}

export interface SuggestionQuery {
  unitPricePaise: number
  quantity: number
  cartProductKeys: string[]
  now?: number
}

export interface RankedSuggestion {
  productKey: string
  displayName: string
  confidence: number
  strength: SuggestionStrength
  inferredUnit: InferredUnit
  breakdown: {
    price: number
    frequency: number
    quantity: number
    recency: number
    association: number
  }
}

export interface SuggestionResult {
  best: RankedSuggestion | null
  alternatives: RankedSuggestion[]
}

export interface LearnObservation {
  displayName: string
  unitPricePaise: number
  quantity: number
  soldAt: number
  weight: number
  source: LineNameSource | 'rejected'
  companionKeys?: string[]
}
