import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from '../stores/useCartStore'

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
    useCartStore.getState().setTaxRatePercent(5)
  })

  describe('amount entry', () => {
    it('appends digits to amount', () => {
      useCartStore.getState().appendToAmount('1')
      useCartStore.getState().appendToAmount('0')
      useCartStore.getState().appendToAmount('0')
      expect(useCartStore.getState().currentAmount).toBe('100')
    })

    it('clears amount after add item', () => {
      useCartStore.getState().appendToAmount('5')
      useCartStore.getState().appendToAmount('0')
      useCartStore.getState().addItem()
      expect(useCartStore.getState().currentAmount).toBe('')
    })
  })

  describe('add item', () => {
    it('adds item with auto name', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const items = useCartStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Item 1')
      expect(items[0].unitPricePaise).toBe(10000)
      expect(items[0].quantity).toBe(1)
    })

    it('rejects zero amount', () => {
      const result = useCartStore.getState().addItem()
      expect(result).toBe(false)
      expect(useCartStore.getState().items).toHaveLength(0)
    })

    it('keeps decimal amounts when adding an item', () => {
      useCartStore.getState().setCurrentAmount('25.50')
      useCartStore.getState().addItem()

      expect(useCartStore.getState().items[0].unitPricePaise).toBe(2550)
    })

    it('adds the entered multiplication quantity to the item', () => {
      useCartStore.getState().setCurrentAmount('500*2')
      useCartStore.getState().addItem()

      const item = useCartStore.getState().items[0]
      expect(item.name).toBe('Item 1')
      expect(item.unitPricePaise).toBe(50000)
      expect(item.quantity).toBe(2)
    })

    it('updates an item name', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const id = useCartStore.getState().items[0].id
      useCartStore.getState().updateItemName(id, 'Milk')

      expect(useCartStore.getState().items[0].name).toBe('Milk')
    })
  })

  describe('multiple items', () => {
    it('adds multiple items with incrementing names', () => {
      useCartStore.getState().setCurrentAmount('50')
      useCartStore.getState().addItem()
      useCartStore.getState().setCurrentAmount('75')
      useCartStore.getState().addItem()
      const items = useCartStore.getState().items
      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('Item 1')
      expect(items[1].name).toBe('Item 2')
    })
  })

  describe('quantity', () => {
    it('increases quantity', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const id = useCartStore.getState().items[0].id
      useCartStore.getState().updateQuantity(id, 1)
      expect(useCartStore.getState().items[0].quantity).toBe(2)
    })

    it('returns confirm-remove when decreasing to zero', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const id = useCartStore.getState().items[0].id
      const result = useCartStore.getState().updateQuantity(id, -1)
      expect(result).toBe('confirm-remove')
    })
  })

  describe('remove item', () => {
    it('removes item from cart', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const id = useCartStore.getState().items[0].id
      useCartStore.getState().removeItem(id)
      expect(useCartStore.getState().items).toHaveLength(0)
    })
  })

  describe('totals', () => {
    it('calculates subtotal', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      useCartStore.getState().setCurrentAmount('50')
      useCartStore.getState().addItem()
      expect(useCartStore.getState().getSubtotalPaise()).toBe(15000)
    })

    it('calculates tax at 5%', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      expect(useCartStore.getState().getTaxPaise()).toBe(500)
    })

    it('calculates grand total with discount', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      useCartStore.getState().setDiscountPaise(200)
      const subtotal = useCartStore.getState().getSubtotalPaise()
      const tax = useCartStore.getState().getTaxPaise()
      expect(useCartStore.getState().getGrandTotalPaise()).toBe(subtotal + tax - 200)
    })

    it('counts items', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const id = useCartStore.getState().items[0].id
      useCartStore.getState().updateQuantity(id, 2)
      expect(useCartStore.getState().getItemCount()).toBe(3)
    })
  })

  describe('save and restore', () => {
    it('loads cart from saved data', () => {
      useCartStore.getState().setCurrentAmount('100')
      useCartStore.getState().addItem()
      const items = [...useCartStore.getState().items]
      useCartStore.getState().clearCart()

      useCartStore.getState().loadCart({
        items,
        customer: { name: 'Test', phone: '9876543210' },
        discountPaise: 100,
      })

      expect(useCartStore.getState().items).toHaveLength(1)
      expect(useCartStore.getState().customer?.name).toBe('Test')
      expect(useCartStore.getState().discountPaise).toBe(100)
    })
  })
})
