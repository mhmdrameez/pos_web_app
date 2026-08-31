import { describe, it, expect, beforeEach } from 'vitest'
import {
  initSupabase,
  isCloudEnabled,
  toSupabaseRow,
  syncAllPendingSales,
} from '../services/cloud/supabaseSync'
import type { CompletedSale } from '../types'

describe('supabaseSync and periodic cloud sync', () => {
  beforeEach(() => {
    localStorage.removeItem('quick-sale-pos:completed-sales')
  })

  it('correctly maps CompletedSale to supabase row', () => {
    const sale: CompletedSale = {
      id: 'sale-123',
      orderNumber: 'ORD-001',
      invoiceNumber: 'INV-000001',
      createdAt: 1000,
      updatedAt: 2000,
      completedAt: 3000,
      status: 'completed',
      customer: { name: 'Alice', phone: '9999999999' },
      items: [{ id: 'item-1', name: 'Item 1', unitPricePaise: 5000, quantity: 2 }],
      subtotalPaise: 10000,
      discountPaise: 1000,
      grandTotalPaise: 9000,
      paymentMethod: 'upi',
      amountPaidPaise: 9000,
      changePaise: 0,
      emailSentAt: 4000,
    }

    const row = toSupabaseRow(sale)
    expect(row.id).toBe('sale-123')
    expect(row.invoice_number).toBe('INV-000001')
    expect(row.order_number).toBe('ORD-001')
    expect(row.created_at).toBe(1000)
    expect(row.updated_at).toBe(2000)
    expect(row.completed_at).toBe(3000)
    expect(row.status).toBe('completed')
    expect(row.subtotal_paise).toBe(10000)
    expect(row.discount_paise).toBe(1000)
    expect(row.grand_total_paise).toBe(9000)
    expect(row.payment_method).toBe('upi')
    expect(row.customer).toEqual({ name: 'Alice', phone: '9999999999' })
  })

  it('gracefully handles sync when cloud sync is disabled', async () => {
    initSupabase('', '', false)
    expect(isCloudEnabled()).toBe(false)
    const result = await syncAllPendingSales()
    expect(result.success).toBe(false)
    expect(result.error).toContain('not enabled')
  })
})
