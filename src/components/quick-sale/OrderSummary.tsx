import { useCartStore } from '../../stores/useCartStore'
import { formatRupees } from '../../utils/money'

export function OrderSummary() {
  const itemCount = useCartStore((s) => s.getItemCount())
  const subtotal = useCartStore((s) => s.getSubtotalPaise())
  const discount = useCartStore((s) => s.discountPaise)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())

  return (
    <div className="space-y-2 pt-4 border-t border-gray-200">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Items ({itemCount})</span>
        <span className="tabular-nums">{formatRupees(subtotal)}</span>
      </div>
      <div className="flex justify-between text-sm text-gray-600">
        <span>Discount</span>
        <span className="tabular-nums">-{formatRupees(discount)}</span>
      </div>
      <div className="flex justify-between text-lg font-bold text-gray-900 pt-2">
        <span>Grand Total</span>
        <span className="tabular-nums">{formatRupees(grandTotal)}</span>
      </div>
    </div>
  )
}
