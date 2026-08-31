import { describe, it, expect } from 'vitest'
import { toEpochMs, toLocalDateStr } from '../utils/date'

describe('toEpochMs', () => {
  it('parses numeric strings from SQLite so Date() gets a real timestamp', () => {
    expect(toEpochMs('1787835853756')).toBe(1787835853756)
    expect(toEpochMs(1787835853756)).toBe(1787835853756)
  })
})

describe('toLocalDateStr', () => {
  it('matches HTML date input for a known IST evening sale', () => {
    // 2026-08-27 ~18:34 IST (backup bill ORD-20260827-183413)
    const str = toLocalDateStr(1787835853756)
    expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date('1787835853756').toString()).toBe('Invalid Date')
    expect(toLocalDateStr('1787835853756')).toBe(str)
  })

  it('does not treat a numeric string as Invalid Date the way new Date(string) does', () => {
    const fromString = toLocalDateStr('1787835853756')
    const fromNumber = toLocalDateStr(1787835853756)
    expect(fromString).toBe(fromNumber)
    expect(fromString.length).toBe(10)
  })
})
