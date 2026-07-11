import { describe, it, expect } from 'vitest'
import { calculateChange } from '../utils/money'

describe('cash change calculation', () => {
  it('calculates correct change', () => {
    expect(calculateChange(10500, 10000)).toBe(500)
    expect(calculateChange(10000, 10000)).toBe(0)
  })

  it('returns 0 for insufficient cash', () => {
    expect(calculateChange(5000, 10000)).toBe(0)
  })

  it('handles paise precision', () => {
    expect(calculateChange(60050, 60000)).toBe(50)
  })
})
