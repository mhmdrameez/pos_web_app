import { create } from 'zustand'
import type { CartItem, CompletedSale, Customer } from '../types'
import type { LineNameSource } from '../types/suggestion'
import {
  calculateGrandTotal,
  calculateSubtotal,
  parseAmountAndQuantity,
  parseAmountInput,
} from '../utils/money'
import { generateId } from '../utils/id'
import { composeLineName, productNameFromLine } from '../services/suggestion/productName'

export function getAlphabetName(num: number): string {
  let result = ''
  let temp = num
  while (temp > 0) {
    temp--
    result = String.fromCharCode(65 + (temp % 26)) + result
    temp = Math.floor(temp / 26)
  }
  return result
}

export function parseAlphabetName(str: string): number {
  let result = 0
  for (let i = 0; i < str.length; i++) {
    result = result * 26 + (str.charCodeAt(i) - 64)
  }
  return result
}

interface CartState {
  items: CartItem[]
  currentAmount: string
  customer: Customer | null
  discountPaise: number
  nextItemNumber: number
  editingSale: CompletedSale | null

  setCurrentAmount: (amount: string) => void
  appendToAmount: (input: string) => void
  backspaceAmount: () => void
  clearAmount: () => void
  addItem: (name?: string, nameSource?: LineNameSource) => boolean
  updateQuantity: (id: string, delta: number) => 'removed' | 'updated' | 'confirm-remove'
  updateItemName: (id: string, name: string) => void
  removeItem: (id: string) => void
  setCustomer: (customer: Customer | null) => void
  setDiscountPaise: (paise: number) => void
  clearCart: () => void
  startEditingSale: (sale: CompletedSale) => void
  cancelEditingSale: () => void
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
  editingSale: null,

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

  addItem: (name, nameSource) => {
    const { currentAmount, items, nextItemNumber } = get()
    const entry = parseAmountAndQuantity(currentAmount)
    if (!entry) return false

    const trimmed = name?.trim()
    const productName = trimmed ? productNameFromLine(trimmed) ?? trimmed : null
    const lineName = composeLineName(entry.unitPricePaise, entry.quantity, productName)
    const newItem: CartItem = {
      id: generateId(),
      name: lineName,
      unitPricePaise: entry.unitPricePaise,
      quantity: entry.quantity,
      nameSource: productNameFromLine(lineName) ? (nameSource ?? 'suggested') : 'auto',
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
      items: items.map((i) =>
        i.id === id
          ? {
              ...i,
              quantity: newQty,
              name: composeLineName(i.unitPricePaise, newQty, productNameFromLine(i.name)),
            }
          : i,
      ),
    })
    return 'updated'
  },

  updateItemName: (id, name) => {
    const trimmedName = name.trim()
    set({
      items: get().items.map((item) => {
        if (item.id !== id) return item
        return {
          ...item,
          name: composeLineName(item.unitPricePaise, item.quantity, trimmedName || null),
          nameSource: trimmedName ? ('manual' as const) : ('auto' as const),
        }
      }),
    })
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
      editingSale: null,
    }),

  startEditingSale: (sale) => {
    const migratedItems = sale.items.map((item) => ({
      ...item,
      name: item.name.replace(/\u00d7/g, 'x'),
    }))

    set({
      items: migratedItems,
      customer: sale.customer ?? null,
      discountPaise: sale.discountPaise,
      currentAmount: '',
      nextItemNumber: migratedItems.length + 1,
      editingSale: sale,
    })
  },

  cancelEditingSale: () => set({ editingSale: null }),

  loadCart: (data) => {
    // Migrate old item names: replace Unicode × with plain x
    const migratedItems = data.items.map((item) => ({
      ...item,
      name: item.name.replace(/\u00d7/g, 'x'),
    }))

    const maxItemNum =
      data.nextItemNumber ??
      (migratedItems.length > 0
        ? Math.max(
            ...migratedItems.map((item) => {
              const matchAlpha = item.name.match(/Item ([A-Z]+)$/)
              if (matchAlpha) return parseAlphabetName(matchAlpha[1])
              const matchNum = item.name.match(/Item (\d+)$/)
              return matchNum ? parseInt(matchNum[1], 10) : 0
            }),
          ) + 1
        : 1)

    set({
      items: migratedItems,
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

  // Decimal quantities (e.g. 2.5 kg) count as 1 in total qty display
  getItemCount: () =>
    get().items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0),
}))
