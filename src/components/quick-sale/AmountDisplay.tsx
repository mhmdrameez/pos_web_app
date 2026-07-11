import { useCartStore } from '../../stores/useCartStore'
import { formatRupees, formatRupeesFromString, parseAmountAndQuantity } from '../../utils/money'

export function AmountDisplay() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const entry = parseAmountAndQuantity(currentAmount)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-1 text-right">Amount</p>
      <p className="text-5xl lg:text-6xl font-bold text-gray-900 text-right tabular-nums">
        {entry
          ? formatRupees(entry.unitPricePaise * entry.quantity)
          : formatRupeesFromString(currentAmount.split('*')[0] || '0')}
      </p>
    </div>
  )
}
