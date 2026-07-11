import { describe, expect, it } from 'vitest'
import { EscPosEncoder } from '../services/printer/EscPosEncoder'
import { generateReceiptData, generateReceiptText } from '../services/receipt/receiptGenerator'
import type { CompletedSale } from '../types'

const sale: CompletedSale = {
  id: 'sale-1',
  orderNumber: 'ORD-000001',
  invoiceNumber: 'INV-000001',
  createdAt: 0,
  updatedAt: 0,
  completedAt: 0,
  status: 'completed',
  items: [{ id: 'item-1', name: 'Tea', unitPricePaise: 50000, quantity: 2 }],
  subtotalPaise: 100000,
  taxPaise: 5000,
  discountPaise: 0,
  grandTotalPaise: 105000,
  paymentMethod: 'cash',
}

describe('receipt printing', () => {
  it('uses printer-safe amounts and shows unit price, quantity, and totals', () => {
    const text = generateReceiptText(generateReceiptData(sale, 'Quick Sale'))

    expect(text).toContain('Rs.500.00 * 2')
    expect(text).toContain('Rs.1,000.00')
    expect(text).toContain('TOTAL')
    expect(text).toContain('Rs.1,050.00')
  })

  it('selects the standard printer font and avoids UTF-8 multi-byte output', () => {
    const bytes = new EscPosEncoder().text('Rs.500.00 * 2').encode()

    expect([...bytes.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x4d, 0x00])
    expect([...bytes.slice(5)]).toEqual([...new TextEncoder().encode('Rs.500.00 * 2')])
  })
})
