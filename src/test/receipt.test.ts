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
  it('shows Total Qty on its own line before TOTAL', () => {
    const text = generateReceiptText(generateReceiptData(sale, 'Quick Sale'))
    const lines = text.split('\n')

    // Total Qty line should appear before TOTAL line
    const qtyIdx = lines.findIndex((l) => l.includes('Total Qty'))
    const totalIdx = lines.findIndex((l) => l.trim().startsWith('TOTAL'))

    expect(qtyIdx).toBeGreaterThan(-1)
    expect(totalIdx).toBeGreaterThan(qtyIdx)
    expect(lines[qtyIdx]).toContain('2')
  })

  it('shows Subtotal and Discount lines only when discount applies', () => {
    const noDiscountText = generateReceiptText(generateReceiptData(sale, 'Quick Sale'))
    expect(noDiscountText).not.toContain('Subtotal')
    expect(noDiscountText).not.toContain('Discount')

    const discountSale: CompletedSale = {
      ...sale,
      discountPaise: 1000,
      grandTotalPaise: 99000,
    }
    const discountText = generateReceiptText(generateReceiptData(discountSale, 'Quick Sale'))
    expect(discountText).toContain('Subtotal')
    expect(discountText).toContain('Discount')
  })

  it('uses printer-safe amounts and shows name, quantity, and TOTAL', () => {
    const text = generateReceiptText(generateReceiptData(sale, 'Quick Sale'))

    expect(text).toContain('Tea')
    expect(text).toContain('TOTAL')
    expect(text).not.toContain('Subtotal') // no discount = no subtotal
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
