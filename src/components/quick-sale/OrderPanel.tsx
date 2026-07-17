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
import { formatRupees } from '../../utils/money'

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
        console.log('Print Preview:\n', text);
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
    <div className={`flex flex-col bg-[#f3f4f7] border-l border-gray-200 p-2.5 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-2.5 py-2.5 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Orders</h2>
        <button
          onClick={openCustomerModal}
          className="flex items-center gap-1.5 text-sm text-[#1e5790] border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl"
        >
          <User className="w-4 h-4" />
          {customer ? customer.name : 'Add Customer'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 rounded-xl bg-[#e9ebef] mt-2 px-4">
        {items.length === 0 ? (
          <div className="h-full grid place-items-center text-center text-gray-600">
            <div>
              <ShoppingCart className="w-14 h-14 mx-auto mb-3 text-gray-700" />
              <p className="font-medium">Your cart is empty</p>
              <p className="text-xs mt-3">Enter an amount and tap Add Item</p>
            </div>
          </div>
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

      <div className="mt-2 rounded-xl bg-[#e9ebef] px-4 pb-3">
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
            Bill {grandTotal > 0 ? formatRupees(grandTotal) : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
