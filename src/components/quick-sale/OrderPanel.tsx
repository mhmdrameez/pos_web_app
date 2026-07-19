import { Printer, Receipt, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCheckout } from '../../hooks/useCheckout'
import { OrderItemRow } from './OrderItemRow'
import { Button } from '../ui/Button'
import { formatRupees } from '../../utils/money'

interface OrderPanelProps {
  className?: string
}

export function OrderPanel({ className = '' }: OrderPanelProps) {
  const items = useCartStore((s) => s.items)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())
  const totalQty = useCartStore((s) => s.getItemCount())
  const openCheckoutModal = useAppStore((s) => s.openCheckoutModal)
  const addToast = useAppStore((s) => s.addToast)
  const { completeSale } = useCheckout()
  const [isPrinting, setIsPrinting] = useState(false)

  // Print = save the sale immediately as cash + print receipt, no modal
  async function handlePrintAndSave() {
    if (isPrinting) return
    if (items.length === 0) {
      addToast('error', 'Add items before printing')
      return
    }
    setIsPrinting(true)
    try {
      await completeSale('cash', grandTotal, true)
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div className={`flex flex-col bg-[#f3f4f7] border-l border-gray-200 ${className}`}>

      {/* Header */}
      <div className="flex items-center px-4 py-2.5 border-b border-gray-200 shrink-0">
        <h2 className="font-semibold text-gray-900">Orders</h2>
      </div>

      {/* Item list — takes all available space */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-[#e9ebef] px-4">
        {items.length === 0 ? (
          <div className="h-full grid place-items-center text-center text-gray-600">
            <div>
              <ShoppingCart className="w-14 h-14 mx-auto mb-3 text-gray-700" />
              <p className="font-medium">Your cart is empty</p>
              <p className="text-xs mt-2">Enter an amount and tap Add Item</p>
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

      {/* Footer — total + 2 compact buttons */}
      <div className="shrink-0 bg-[#e9ebef] px-4 pt-3 pb-3 border-t border-gray-200">
        {/* Total Qty + Grand total */}
        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>Total Qty</span>
            <span className="font-semibold tabular-nums">
              {Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(2).replace(/\.?0+$/, '')}
            </span>
          </div>
          <div className="flex justify-between items-center font-bold text-gray-900">
            <span className="text-sm">Grand Total</span>
            <span className="text-lg tabular-nums">
              {grandTotal > 0 ? formatRupees(grandTotal) : '₹0'}
            </span>
          </div>
        </div>

        {/* Two compact action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={handlePrintAndSave}
            disabled={isPrinting}
            className="flex items-center justify-center gap-1.5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? 'Printing...' : 'Print'}
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
            className="flex items-center justify-center gap-1.5 py-2 text-sm"
          >
            <Receipt className="w-4 h-4" />
            Bill {grandTotal > 0 ? formatRupees(grandTotal) : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
