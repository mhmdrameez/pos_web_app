import { useCartStore } from '../../stores/useCartStore'
import { formatRupees } from '../../utils/money'

export function OrderSummary() {
  const itemCount = useCartStore((s) => s.getItemCount())
  const subtotal = useCartStore((s) => s.getSubtotalPaise())
  const discount = useCartStore((s) => s.discountPaise)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())

  return (
    <div className="space-y-1 lg:space-y-2 pt-2 lg:pt-4 border-t border-gray-200">
      <div className="flex justify-between text-xs lg:text-sm text-gray-600">
        <span>Items ({itemCount})</span>
        <span className="tabular-nums">{formatRupees(subtotal)}</span>
      </div>
      <div className="flex justify-between text-xs lg:text-sm text-gray-600">
        <span>Discount</span>
        <span className="tabular-nums">-{formatRupees(discount)}</span>
      </div>
      <div className="flex justify-between text-sm lg:text-lg font-bold text-gray-900 pt-1 lg:pt-2">
        <span>Total</span>
        <span className="tabular-nums">{formatRupees(grandTotal)}</span>
      </div>
    </div>
  )
}
