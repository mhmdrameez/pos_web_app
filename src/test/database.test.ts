import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  saveOrder,
  getSavedOrders,
  saveCartSnapshot,
  getCartSnapshot,
  saveCompletedSale,
  getCompletedSales,
} from '../services/db/database'
import type { CompletedSale, SavedOrder } from '../types'

describe('database persistence', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.removeItem('quick-sale-pos:completed-sales')
  })

  it('saves and retrieves orders', async () => {
    const order: SavedOrder = {
      id: 'order-1',
      orderNumber: 'ORD-001',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [
        { id: 'item-1', name: 'Item 1', unitPricePaise: 10000, quantity: 1 },
      ],
      subtotalPaise: 10000,
      discountPaise: 0,
      grandTotalPaise: 10000,
      status: 'draft',
    }

    await saveOrder(order)
    const orders = await getSavedOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].orderNumber).toBe('ORD-001')
  })

  it('saves and restores cart snapshot', async () => {
    await saveCartSnapshot({
      items: [{ id: 'i1', name: 'Item 1', unitPricePaise: 5000, quantity: 2 }],
      currentAmount: '25',
      customer: null,
      discountPaise: 0,
    })

    const cart = await getCartSnapshot()
    expect(cart.items).toHaveLength(1)
    expect(cart.currentAmount).toBe('25')
    expect(cart.items[0].unitPricePaise).toBe(5000)
  })

  it('saves each completed bill locally and retrieves it from sales history', async () => {
    const sale: CompletedSale = {
      id: 'sale-1',
      orderNumber: 'ORD-001',
      invoiceNumber: 'INV-000001',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      items: [{ id: 'item-1', name: 'Item 1', unitPricePaise: 10000, quantity: 1 }],
      subtotalPaise: 10000,
      discountPaise: 0,
      grandTotalPaise: 10000,
      status: 'completed',
      paymentMethod: 'cash',
      amountPaidPaise: 10000,
    }

    await saveCompletedSale(sale)

    expect(await getCompletedSales()).toEqual([sale])
    expect(JSON.parse(localStorage.getItem('quick-sale-pos:completed-sales') ?? '[]')).toEqual([sale])
  })
})
