import { useAppStore } from '../stores/useAppStore'
import { useCartStore } from '../stores/useCartStore'
import {
  getNextInvoiceNumber,
  saveCompletedSale,
  saveOrder,
  deleteSavedOrder,
} from '../services/db/database'
import { generateId, generateOrderNumber } from '../utils/id'
import type { CompletedSale, PaymentMethod, SavedOrder } from '../types'
import { printerService } from '../services/printer/PrinterService'
import { usePrinterStore } from '../stores/usePrinterStore'

export function useCheckout() {
  const addToast = useAppStore((s) => s.addToast)
  const closeCheckoutModal = useAppStore((s) => s.closeCheckoutModal)
  const businessName = useAppStore((s) => s.businessName)
  const clearCart = useCartStore((s) => s.clearCart)
  const paperWidth = usePrinterStore((s) => s.paperWidth)

  async function completeSale(
    paymentMethod: PaymentMethod,
    amountPaidPaise?: number,
    shouldPrint = false,
    savedOrderId?: string,
  ): Promise<boolean> {
    const cart = useCartStore.getState()
    const items = cart.items

    if (items.length === 0) {
      addToast('error', 'Add at least one item to complete sale')
      return false
    }

    try {
      const invoiceNumber = await getNextInvoiceNumber()
      const now = Date.now()
      const subtotalPaise = cart.getSubtotalPaise()
      const taxPaise = cart.getTaxPaise()
      const discountPaise = cart.discountPaise
      const grandTotalPaise = cart.getGrandTotalPaise()

      const sale: CompletedSale = {
        id: generateId(),
        orderNumber: generateOrderNumber(),
        invoiceNumber,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        customer: cart.customer ?? undefined,
        items: [...items],
        subtotalPaise,
        taxPaise,
        discountPaise,
        grandTotalPaise,
        status: 'completed',
        paymentMethod,
        amountPaidPaise: paymentMethod === 'cash' ? amountPaidPaise : grandTotalPaise,
        changePaise:
          paymentMethod === 'cash' && amountPaidPaise
            ? Math.max(0, amountPaidPaise - grandTotalPaise)
            : undefined,
      }

      await saveCompletedSale(sale)

      if (savedOrderId) {
        await deleteSavedOrder(savedOrderId)
      }

      if (shouldPrint) {
        try {
          if (!printerService.isConnected()) {
            addToast('info', 'Connect a printer in Printer Settings to print receipts')
          } else {
            await printerService.printReceipt(sale, businessName, paperWidth)
            addToast('success', 'Receipt printed')
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Print failed'
          addToast('error', message)
        }
      }

      clearCart()
      closeCheckoutModal()
      addToast('success', `Sale completed — ${invoiceNumber}`)
      return true
    } catch {
      addToast('error', 'Failed to complete sale')
      return false
    }
  }

  async function saveCurrentOrder(savedOrderId?: string): Promise<boolean> {
    const cart = useCartStore.getState()
    const items = cart.items

    if (items.length === 0) {
      addToast('error', 'Add at least one item to save order')
      return false
    }

    try {
      const now = Date.now()
      const order: SavedOrder = {
        id: savedOrderId ?? generateId(),
        orderNumber: generateOrderNumber(),
        createdAt: now,
        updatedAt: now,
        customer: cart.customer ?? undefined,
        items: [...items],
        subtotalPaise: cart.getSubtotalPaise(),
        taxPaise: cart.getTaxPaise(),
        discountPaise: cart.discountPaise,
        grandTotalPaise: cart.getGrandTotalPaise(),
        status: 'draft',
      }

      if (savedOrderId) {
        const existing = await import('../services/db/database').then((m) =>
          m.getSavedOrder(savedOrderId),
        )
        if (existing) {
          order.createdAt = existing.createdAt
          order.orderNumber = existing.orderNumber
        }
      }

      await saveOrder(order)
      addToast('success', 'Order saved')
      return true
    } catch {
      addToast('error', 'Failed to save order')
      return false
    }
  }

  return { completeSale, saveCurrentOrder }
}
