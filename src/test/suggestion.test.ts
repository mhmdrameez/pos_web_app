import { describe, it, expect, beforeEach } from 'vitest'
import { ProductSuggestionEngine } from '../services/suggestion/engine'
import { MIN_CONFIDENCE, STRONG_CONFIDENCE } from '../services/suggestion/scoring'
import { isGenericLineName, normalizeProductKey, composeLineName, productNameFromLine } from '../services/suggestion/productName'
import type { LearnObservation } from '../types/suggestion'

function learn(
  engine: ProductSuggestionEngine,
  name: string,
  rupees: number,
  quantity: number,
  times: number,
  source: LearnObservation['source'] = 'manual',
  soldAt = Date.now(),
) {
  for (let i = 0; i < times; i += 1) {
    engine.learn({
      displayName: name,
      unitPricePaise: Math.round(rupees * 100),
      quantity,
      soldAt: soldAt - i * 60_000,
      weight: source === 'manual' ? 3 : 1,
      source,
    })
  }
}

describe('product name helpers', () => {
  it('treats auto line names as generic', () => {
    expect(isGenericLineName('29 x 2.5')).toBe(true)
    expect(isGenericLineName('100 x 1')).toBe(true)
    expect(isGenericLineName('Item A')).toBe(true)
    expect(isGenericLineName('Lining')).toBe(false)
    expect(isGenericLineName('Cotton Mix')).toBe(false)
    expect(isGenericLineName('29 x 4 (Lining)')).toBe(false)
  })

  it('reads the product from a 29 x 4 (name) line', () => {
    expect(productNameFromLine('29 x 4 (Lining)')).toBe('Lining')
    expect(composeLineName(2900, 4, 'Lining')).toBe('29 x 4 (Lining)')
  })

  it('normalizes product keys', () => {
    expect(normalizeProductKey('  lining ')).toBe('lining')
  })
})

describe('product suggestion engine', () => {
  let engine: ProductSuggestionEngine

  beforeEach(() => {
    engine = new ProductSuggestionEngine()
  })

  it('suggests a product for an exact historical price', () => {
    learn(engine, 'Lining', 29, 2.5, 6)
    const result = engine.suggest({ unitPricePaise: 2900, quantity: 2.5, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Lining')
    expect(result.best?.strength).toBe('suggested')
    expect(result.best?.confidence ?? 0).toBeGreaterThanOrEqual(STRONG_CONFIDENCE)
  })

  it('still matches a nearby price after a price change', () => {
    learn(engine, 'Lining', 29, 2.5, 4, 'manual', Date.now() - 40 * 86_400_000)
    learn(engine, 'Lining', 32, 2.5, 3)
    learn(engine, 'Lining', 35, 2, 2)
    const nearby = engine.suggest({ unitPricePaise: 3200, quantity: 2.5, cartProductKeys: [] })
    expect(nearby.best?.displayName).toBe('Lining')
    expect(nearby.best?.confidence ?? 0).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })

  it('ranks the more frequent product when two share a price', () => {
    learn(engine, 'Lining', 40, 1, 8)
    learn(engine, 'Satin', 40, 1, 3)
    const result = engine.suggest({ unitPricePaise: 4000, quantity: 1, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Lining')
    expect(result.alternatives.some((item) => item.displayName === 'Satin')).toBe(true)
  })

  it('uses decimal quantity to prefer meter-like products', () => {
    learn(engine, 'Lining', 29, 2.5, 8)
    learn(engine, 'Shirt', 29, 1, 8)
    const result = engine.suggest({ unitPricePaise: 2900, quantity: 2.5, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Lining')
  })

  it('suggests cotton for a distinct price pattern', () => {
    learn(engine, 'Cotton', 45, 3, 6)
    const result = engine.suggest({ unitPricePaise: 4500, quantity: 3, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Cotton')
    expect(result.best?.confidence ?? 0).toBeGreaterThanOrEqual(0.8)
  })

  it('does not let a popular product steal a different price', () => {
    learn(engine, 'Lining', 29, 2.5, 40)
    learn(engine, 'Cotton', 45, 3, 4)
    learn(engine, 'Polyester', 55, 1, 3)
    learn(engine, 'Satin', 70, 2, 2)
    learn(engine, 'Denim', 80, 1, 2)
    learn(engine, 'Shirt', 250, 1, 3)
    learn(engine, 'Pant', 400, 1, 2)

    expect(engine.suggest({ unitPricePaise: 2900, quantity: 2.5, cartProductKeys: [] }).best?.displayName).toBe('Lining')
    expect(engine.suggest({ unitPricePaise: 4500, quantity: 3, cartProductKeys: [] }).best?.displayName).toBe('Cotton')
    expect(engine.suggest({ unitPricePaise: 5500, quantity: 1, cartProductKeys: [] }).best?.displayName).toBe('Polyester')
    expect(engine.suggest({ unitPricePaise: 7000, quantity: 2, cartProductKeys: [] }).best?.displayName).toBe('Satin')
    expect(engine.suggest({ unitPricePaise: 8000, quantity: 1, cartProductKeys: [] }).best?.displayName).toBe('Denim')
    expect(engine.suggest({ unitPricePaise: 25_000, quantity: 1, cartProductKeys: [] }).best?.displayName).toBe('Shirt')
    expect(engine.suggest({ unitPricePaise: 40_000, quantity: 1, cartProductKeys: [] }).best?.displayName).toBe('Pant')
  })

  it('does not invent a name for a new or unknown price', () => {
    learn(engine, 'Lining', 29, 2.5, 6)
    const result = engine.suggest({ unitPricePaise: 19_900, quantity: 1, cartProductKeys: [] })
    expect(result.best).toBeNull()
  })

  it('suggests after a single named sale at that price', () => {
    learn(engine, 'Denim', 80, 1, 1)
    const result = engine.suggest({ unitPricePaise: 8000, quantity: 1, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Denim')
  })

  it('learns from a cashier correction', () => {
    learn(engine, 'Lining', 29, 2.5, 3)
    engine.learn({
      displayName: 'Lining',
      unitPricePaise: 2900,
      quantity: 2.5,
      soldAt: Date.now(),
      weight: 1,
      source: 'rejected',
    })
    learn(engine, 'Cotton', 29, 2.5, 6)
    const result = engine.suggest({ unitPricePaise: 2900, quantity: 2.5, cartProductKeys: [] })
    expect(result.best?.displayName).toBe('Cotton')
  })

  it('does not learn cancelled transactions as positive sales', () => {
    learn(engine, 'Polyester', 55, 1, 4)
    engine.unlearn({
      displayName: 'Polyester',
      unitPricePaise: 5500,
      quantity: 1,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    engine.unlearn({
      displayName: 'Polyester',
      unitPricePaise: 5500,
      quantity: 1,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    engine.unlearn({
      displayName: 'Polyester',
      unitPricePaise: 5500,
      quantity: 1,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    engine.unlearn({
      displayName: 'Polyester',
      unitPricePaise: 5500,
      quantity: 1,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    const result = engine.suggest({ unitPricePaise: 5500, quantity: 1, cartProductKeys: [] })
    expect(result.best).toBeNull()
  })

  it('ignores generic auto names', () => {
    learn(engine, '29 x 2.5', 29, 2.5, 8)
    const result = engine.suggest({ unitPricePaise: 2900, quantity: 2.5, cartProductKeys: [] })
    expect(result.best).toBeNull()
  })

  it('suggests quickly over a large in-memory history', () => {
    const names = ['Lining', 'Cotton', 'Polyester', 'Satin', 'Denim', 'Shirt', 'Pant']
    for (let i = 0; i < 50_000; i += 1) {
      const name = names[i % names.length]
      engine.learn({
        displayName: name,
        unitPricePaise: (20 + (i % names.length) * 7) * 100,
        quantity: i % 3 === 0 ? 2.5 : 1,
        soldAt: Date.now() - i * 1000,
        weight: 1,
        source: 'auto',
      })
    }
    const started = performance.now()
    const result = engine.suggest({ unitPricePaise: 2000, quantity: 2.5, cartProductKeys: [] })
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(50)
    expect(result.best?.displayName).toBe('Lining')
  })
})
