import { describe, it, expect } from 'vitest'
import {
  parseAmountInput,
  amountStringToPaise,
  calculateSubtotal,
  calculateTax,
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

    it('handles decimal point', () => {
      expect(parseAmountInput('', '.')).toBe('0.')
      expect(parseAmountInput('12', '.')).toBe('12.')
    })

    it('limits to 2 decimal places', () => {
      expect(parseAmountInput('1.23', '4')).toBe('1.23')
    })

    it('prevents multiple decimal points', () => {
      expect(parseAmountInput('1.2', '.')).toBe('1.2')
    })

    it('handles 00 suffix', () => {
      expect(parseAmountInput('1', '00')).toBe('100')
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

    it('calculates tax', () => {
      expect(calculateTax(10000, 5)).toBe(500)
      expect(calculateTax(999, 5)).toBe(50)
    })

    it('calculates grand total with discount', () => {
      expect(calculateGrandTotal(10000, 500, 200)).toBe(10300)
      expect(calculateGrandTotal(1000, 50, 2000)).toBe(0)
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
