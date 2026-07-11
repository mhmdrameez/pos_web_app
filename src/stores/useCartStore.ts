import { create } from 'zustand'
import type { CartItem, Customer } from '../types'
import {
  calculateGrandTotal,
  calculateSubtotal,
  parseAmountAndQuantity,
  parseAmountInput,
} from '../utils/money'
import { generateId } from '../utils/id'

interface CartState {
  items: CartItem[]
  currentAmount: string
  customer: Customer | null
  discountPaise: number
  nextItemNumber: number

  setCurrentAmount: (amount: string) => void
  appendToAmount: (input: string) => void
  backspaceAmount: () => void
  clearAmount: () => void
  addItem: () => boolean
  updateQuantity: (id: string, delta: number) => 'removed' | 'updated' | 'confirm-remove'
  updateItemName: (id: string, name: string) => void
  removeItem: (id: string) => void
  setCustomer: (customer: Customer | null) => void
  setDiscountPaise: (paise: number) => void
  clearCart: () => void
  loadCart: (data: {
    items: CartItem[]
    customer?: Customer | null
    discountPaise?: number
    nextItemNumber?: number
  }) => void
  getSnapshot: () => {
    items: CartItem[]
    currentAmount: string
    customer: Customer | null
    discountPaise: number
  }

  getSubtotalPaise: () => number
  getGrandTotalPaise: () => number
  getItemCount: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  currentAmount: '',
  customer: null,
  discountPaise: 0,
  nextItemNumber: 1,

  setCurrentAmount: (amount) => set({ currentAmount: amount }),

  appendToAmount: (input) => {
    const { currentAmount } = get()
    set({ currentAmount: parseAmountInput(currentAmount, input) })
  },

  backspaceAmount: () => {
    const { currentAmount } = get()
    set({ currentAmount: currentAmount.slice(0, -1) })
  },

  clearAmount: () => set({ currentAmount: '' }),

  addItem: () => {
    const { currentAmount, items, nextItemNumber } = get()
    const entry = parseAmountAndQuantity(currentAmount)
    if (!entry) return false

    const newItem: CartItem = {
      id: generateId(),
      name: `Item ${nextItemNumber}`,
      unitPricePaise: entry.unitPricePaise,
      quantity: entry.quantity,
    }

    set({
      items: [...items, newItem],
      currentAmount: '',
      nextItemNumber: nextItemNumber + 1,
    })
    return true
  },

  updateQuantity: (id, delta) => {
    const { items } = get()
    const item = items.find((i) => i.id === id)
    if (!item) return 'updated'

    const newQty = item.quantity + delta
    if (newQty <= 0) return 'confirm-remove'

    set({
      items: items.map((i) => (i.id === id ? { ...i, quantity: newQty } : i)),
    })
    return 'updated'
  },

  updateItemName: (id, name) => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    set({ items: get().items.map((item) => (item.id === id ? { ...item, name: trimmedName } : item)) })
  },

  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  setCustomer: (customer) => set({ customer }),

  setDiscountPaise: (paise) => set({ discountPaise: Math.max(0, paise) }),

  clearCart: () =>
    set({
      items: [],
      currentAmount: '',
      customer: null,
      discountPaise: 0,
      nextItemNumber: 1,
    }),

  loadCart: (data) => {
    const maxItemNum =
      data.nextItemNumber ??
      (data.items.length > 0
        ? Math.max(
            ...data.items.map((item) => {
              const match = item.name.match(/Item (\d+)/)
              return match ? parseInt(match[1], 10) : 0
            }),
          ) + 1
        : 1)

    set({
      items: data.items,
      customer: data.customer ?? null,
      discountPaise: data.discountPaise ?? 0,
      currentAmount: '',
      nextItemNumber: maxItemNum,
    })
  },

  getSnapshot: () => {
    const { items, currentAmount, customer, discountPaise } = get()
    return { items, currentAmount, customer, discountPaise }
  },

  getSubtotalPaise: () => calculateSubtotal(get().items),

  getGrandTotalPaise: () => {
    const subtotal = get().getSubtotalPaise()
    return calculateGrandTotal(subtotal, get().discountPaise)
  },

  getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
}))
