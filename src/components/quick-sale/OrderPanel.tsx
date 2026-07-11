import { User, Printer, Save, Trash2, Receipt, ShoppingCart } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCheckout } from '../../hooks/useCheckout'
import { OrderItemRow } from './OrderItemRow'
import { OrderSummary } from './OrderSummary'
import { Button } from '../ui/Button'
import { printerService } from '../../services/printer/PrinterService'
import { generateReceiptData, generateReceiptText } from '../../services/receipt/receiptGenerator'
import { usePrinterStore } from '../../stores/usePrinterStore'

interface OrderPanelProps {
  className?: string
}

export function OrderPanel({ className = '' }: OrderPanelProps) {
  const items = useCartStore((s) => s.items)
  const customer = useCartStore((s) => s.customer)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())
  const clearCart = useCartStore((s) => s.clearCart)
  const openCustomerModal = useAppStore((s) => s.openCustomerModal)
  const openCheckoutModal = useAppStore((s) => s.openCheckoutModal)
  const showConfirm = useAppStore((s) => s.showConfirm)
  const addToast = useAppStore((s) => s.addToast)
  const businessName = useAppStore((s) => s.businessName)
  const paperWidth = usePrinterStore((s) => s.paperWidth)
  const { saveCurrentOrder } = useCheckout()

  async function handlePrint() {
    if (items.length === 0) {
      addToast('error', 'Add items before printing')
      return
    }

    const cart = useCartStore.getState()
    const previewSale = {
      id: 'preview',
      orderNumber: 'PREVIEW',
      invoiceNumber: 'PREVIEW',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      customer: customer ?? undefined,
      items: [...items],
      subtotalPaise: cart.getSubtotalPaise(),
      taxPaise: cart.getTaxPaise(),
      discountPaise: cart.discountPaise,
      grandTotalPaise: grandTotal,
      status: 'draft' as const,
      paymentMethod: 'cash' as const,
    }

    try {
      if (printerService.isConnected()) {
        await printerService.printReceipt(previewSale, businessName, paperWidth)
        addToast('success', 'Bill sent to printer')
      } else {
        const data = generateReceiptData(previewSale, businessName)
        const text = generateReceiptText(data, paperWidth)
        const win = window.open('', '_blank', 'width=400,height=600')
        if (win) {
          win.document.write(`<pre style="font-family:monospace;font-size:12px;padding:16px">${text}</pre>`)
          win.document.close()
          win.print()
        }
        addToast('info', 'No printer connected — opened print preview')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed'
      addToast('error', message)
    }
  }

  return (
    <div className={`flex flex-col bg-white border-l border-gray-200 ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Current Order
        </h2>
        <button
          onClick={openCustomerModal}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <User className="w-4 h-4" />
          {customer ? customer.name : 'Add Customer'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 min-h-0">
        {items.length === 0 ? (
          <p className="text-gray-400 text-center py-12 text-sm">No items yet. Enter amount and tap Add Item.</p>
        ) : (
          items.map((item) => (
            <OrderItemRow
              key={item.id}
              id={item.id}
              name={item.name}
              unitPricePaise={item.unitPricePaise}
              quantity={item.quantity}
            />
          ))
        )}
      </div>

      <div className="px-4 pb-4">
        <OrderSummary />

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button
            variant="secondary"
            onClick={() =>
              showConfirm('Clear Order', 'Remove all items from the current order?', clearCart)
            }
            className="flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Order
          </Button>
          <Button
            variant="secondary"
            onClick={() => saveCurrentOrder()}
            className="flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Order
          </Button>
          <Button
            variant="secondary"
            onClick={handlePrint}
            className="flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (items.length === 0) {
                addToast('error', 'Add at least one item to bill')
                return
              }
              openCheckoutModal()
            }}
            className="flex items-center justify-center gap-2"
          >
            <Receipt className="w-4 h-4" />
            Bill {grandTotal > 0 ? `— ₹${(grandTotal / 100).toFixed(2)}` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
