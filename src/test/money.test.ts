import { describe, it, expect } from 'vitest'
import {
  parseAmountInput,
  parseAmountAndQuantity,
  amountStringToPaise,
  calculateSubtotal,
  calculateGrandTotal,
  calculateChange,
  formatRupees,
} from '../utils/money'

describe('money utilities', () => {
  describe('parseAmountInput', () => {
    it('appends digits', () => {
      expect(parseAmountInput('', '5')).toBe('5')
      expect(parseAmountInput('12', '3')).toBe('123')
    })

    it('replaces leading zero', () => {
      expect(parseAmountInput('0', '5')).toBe('5')
    })

    it('handles decimal point in price', () => {
      expect(parseAmountInput('', '.')).toBe('0.')
      expect(parseAmountInput('12', '.')).toBe('12.')
    })

    it('limits price to 2 decimal places', () => {
      expect(parseAmountInput('1.23', '4')).toBe('1.23')
    })

    it('prevents multiple decimal points in price', () => {
      expect(parseAmountInput('1.2', '.')).toBe('1.2')
    })

    it('handles 00 suffix on price', () => {
      expect(parseAmountInput('1', '00')).toBe('100')
    })

    it('allows decimal quantity after * (e.g. 30*2.50)', () => {
      expect(parseAmountInput('30*2', '.')).toBe('30*2.')
      expect(parseAmountInput('30*2.', '5')).toBe('30*2.5')
      expect(parseAmountInput('30*2.5', '0')).toBe('30*2.50')
    })

    it('limits quantity decimal to 2 places', () => {
      expect(parseAmountInput('30*2.50', '1')).toBe('30*2.50')
    })

    it('prevents second decimal in quantity', () => {
      expect(parseAmountInput('30*2.5', '.')).toBe('30*2.5')
    })

    it('blocks 00 in quantity part', () => {
      expect(parseAmountInput('65*3', '00')).toBe('65*3')
    })
  })

  describe('parseAmountAndQuantity', () => {
    it('parses integer quantity', () => {
      expect(parseAmountAndQuantity('65*3')).toEqual({ unitPricePaise: 6500, quantity: 3 })
    })

    it('parses decimal quantity like 30*2.50', () => {
      expect(parseAmountAndQuantity('30*2.50')).toEqual({ unitPricePaise: 3000, quantity: 2.5 })
    })

    it('parses decimal quantity like 30*2.75', () => {
      expect(parseAmountAndQuantity('30*2.75')).toEqual({ unitPricePaise: 3000, quantity: 2.75 })
    })

    it('returns null for zero quantity', () => {
      expect(parseAmountAndQuantity('65*0')).toBeNull()
    })

    it('allows decimal price with decimal quantity', () => {
      expect(parseAmountAndQuantity('30.50*2.5')).toEqual({ unitPricePaise: 3050, quantity: 2.5 })
    })
  })

  describe('amountStringToPaise', () => {
    it('converts rupees to paise', () => {
      expect(amountStringToPaise('600')).toBe(60000)
      expect(amountStringToPaise('600.50')).toBe(60050)
      expect(amountStringToPaise('0.01')).toBe(1)
    })

    it('returns 0 for invalid input', () => {
      expect(amountStringToPaise('')).toBe(0)
      expect(amountStringToPaise('abc')).toBe(0)
    })
  })

  describe('calculations', () => {
    it('calculates subtotal without float errors', () => {
      const items = [
        { unitPricePaise: 10050, quantity: 2 },
        { unitPricePaise: 3333, quantity: 3 },
      ]
      expect(calculateSubtotal(items)).toBe(30099)
    })

    it('calculates grand total with discount', () => {
      expect(calculateGrandTotal(10000, 200)).toBe(9800)
      expect(calculateGrandTotal(1000, 2000)).toBe(0)
    })

    it('calculates change', () => {
      expect(calculateChange(10500, 10000)).toBe(500)
      expect(calculateChange(9000, 10000)).toBe(0)
    })
  })

  describe('formatRupees', () => {
    it('formats Indian currency', () => {
      expect(formatRupees(60000)).toBe('₹600.00')
      expect(formatRupees(1050)).toBe('₹10.50')
    })
  })
})
