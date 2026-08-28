import { useAppStore } from '../stores/useAppStore'
import { useCartStore } from '../stores/useCartStore'
import {
  getNextInvoiceNumber,
  getCompletedSale,
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
    issueCouponForChange = false,
    appliedCouponCode?: string,
  ): Promise<boolean> {
    const cart = useCartStore.getState()
    const items = cart.items

    if (items.length === 0) {
      addToast('error', 'Add at least one item to complete sale')
      return false
    }

    try {
      const now = Date.now()
      const subtotalPaise = cart.getSubtotalPaise()
      
      // Calculate effective grand total after applying coupon
      let discountPaise = cart.discountPaise
      let grandTotalPaise = cart.getGrandTotalPaise()
      let finalGrandTotalPaise = grandTotalPaise
      
      let couponDiscount = 0
      const db = await import('../services/db/database')
      if (appliedCouponCode) {
        const coupon = await db.getCouponByCode(appliedCouponCode)
        if (coupon && coupon.status === 'active') {
          couponDiscount = coupon.amountPaise
          finalGrandTotalPaise = Math.max(0, grandTotalPaise - couponDiscount)
        } else {
           addToast('error', 'Invalid or already used coupon')
           return false
        }
      }

      const editingSale = cart.editingSale

      let sale: CompletedSale
      let previousSale: CompletedSale | undefined
      
      const isCash = paymentMethod === 'cash'
      let changePaise = isCash && amountPaidPaise ? Math.max(0, amountPaidPaise - finalGrandTotalPaise) : undefined
      
      let issuedCouponCode: string | undefined
      if (issueCouponForChange && changePaise && changePaise > 0) {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
          let code = ''
          for (let i = 0; i < 8; i++) {
            if (i === 4) code += '-'
            code += chars.charAt(Math.floor(Math.random() * chars.length))
          }
          issuedCouponCode = code
          await db.createCoupon({
            id: generateId(),
            code,
            amountPaise: changePaise,
            status: 'active',
            createdAt: now,
          })
          // If change is issued as coupon, they don't get cash back
          changePaise = 0
      }

      if (editingSale) {
        const existing = await getCompletedSale(editingSale.id)
        if (!existing || existing.status === 'cancelled') {
          addToast('error', 'This bill can no longer be edited')
          cart.cancelEditingSale()
          return false
        }
        previousSale = existing

        sale = {
          ...existing,
          updatedAt: now,
          customer: cart.customer ?? undefined,
          items: [...items],
          subtotalPaise,
          discountPaise,
          grandTotalPaise: finalGrandTotalPaise,
          paymentMethod,
          amountPaidPaise: isCash ? amountPaidPaise : finalGrandTotalPaise,
          changePaise,
          appliedCouponCode,
          issuedCouponCode,
        }
      } else {
        const invoiceNumber = await getNextInvoiceNumber()
        sale = {
          id: generateId(),
          orderNumber: generateOrderNumber(),
          invoiceNumber,
          createdAt: now,
          updatedAt: now,
          completedAt: now,
          customer: cart.customer ?? undefined,
          items: [...items],
          subtotalPaise,
          discountPaise,
          grandTotalPaise: finalGrandTotalPaise,
          status: 'completed',
          paymentMethod,
          amountPaidPaise: isCash ? amountPaidPaise : finalGrandTotalPaise,
          changePaise,
          appliedCouponCode,
          issuedCouponCode,
        }
      }

      await saveCompletedSale(sale)
      
      if (appliedCouponCode) {
         const coupon = await db.getCouponByCode(appliedCouponCode)
         if (coupon) {
            await db.markCouponUsed(coupon.id)
         }
      }

      const { forgetCompletedSale, ingestCompletedSale, persistSuggestionSnapshot } = await import(
        '../services/suggestion'
      )
      if (previousSale) forgetCompletedSale(previousSale)
      ingestCompletedSale(sale)
      await persistSuggestionSnapshot()

      // Fire-and-forget cloud sync — never blocks checkout
      import('../services/cloud/supabaseSync').then(({ syncCompletedSale }) => {
        syncCompletedSale(sale)
      }).catch(() => {})

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
      
      const successMsg = editingSale ? `Bill updated — ${sale.invoiceNumber}` : `Sale completed — ${sale.invoiceNumber}`
      if (issuedCouponCode) {
          addToast('success', `${successMsg} (Issued Coupon: ${issuedCouponCode})`)
      } else {
          addToast('success', successMsg)
      }
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
