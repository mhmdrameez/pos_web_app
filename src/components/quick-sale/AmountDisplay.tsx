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
    <div className="bg-[#f5f6fa] rounded-xl border border-gray-100 px-3 py-2 md:py-2 lg:py-3 lg:px-5 mb-2">
      <p className="text-xs text-gray-500 mb-0.5">Amount</p>
      <p className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-900 tabular-nums">
        {displayAmount}
      </p>
    </div>
  )
}
