import { useCartStore } from '../../stores/useCartStore'
import { formatRupees, formatRupeesFromString, parseAmountAndQuantity } from '../../utils/money'

export function AmountDisplay() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const entry = parseAmountAndQuantity(currentAmount)
  const enteredAmount = currentAmount.split('*')[0] || '0'
  const formattedEnteredAmount = formatRupeesFromString(enteredAmount)
  const displayAmount =
    entry && currentAmount.includes('*')
      ? enteredAmount.includes('.')
        ? formatRupees(entry.unitPricePaise * entry.quantity)
        : formatRupeesFromString(String((entry.unitPricePaise * entry.quantity) / 100))
      : enteredAmount.endsWith('.')
        ? `${formattedEnteredAmount}.`
        : formattedEnteredAmount

  return (
    <div className="bg-[#f5f6fa] rounded-xl border border-gray-100 px-5 py-3 mb-3">
      <p className="text-xs text-gray-500 mb-1">Amount</p>
      <p className="text-2xl lg:text-3xl font-semibold text-gray-900 tabular-nums">
        {displayAmount}
      </p>
    </div>
  )
}
