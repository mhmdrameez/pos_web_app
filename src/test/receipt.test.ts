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
  discountPaise: 0,
  grandTotalPaise: 100000,
  paymentMethod: 'cash',
}

describe('receipt printing', () => {
  it('uses printer-safe amounts and shows unit price, quantity, and totals', () => {
    const text = generateReceiptText(generateReceiptData(sale, 'Quick Sale'))

    expect(text).toContain('Tea')
    expect(text).toContain('Rs.1,000.00')
    expect(text).toContain('TOTAL')
    expect(text).toContain('Rs.1,000.00')
    expect(text).not.toContain('Subtotal')
  })

  it('does not print the temporary preview invoice number', () => {
    const preview = { ...sale, invoiceNumber: 'PREVIEW' }

    expect(generateReceiptText(generateReceiptData(preview, 'Quick Sale'))).not.toContain('PREVIEW')
  })

  it('selects the standard printer font and avoids UTF-8 multi-byte output', () => {
    const bytes = new EscPosEncoder().text('Rs.500.00 * 2').encode()

    expect([...bytes.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x4d, 0x00])
    expect([...bytes.slice(5)]).toEqual([...new TextEncoder().encode('Rs.500.00 * 2')])
  })

  it('uses a cut command without additional printer feed', () => {
    const bytes = new EscPosEncoder().cut().encode()

    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x41, 0x00])
  })

  it('uses ESC d to add a blank line after the total section', () => {
    const bytes = new EscPosEncoder().text('TOTAL').feedLines(1).encode()

    expect([...bytes.slice(-3)]).toEqual([0x1b, 0x64, 0x01])
  })
})
