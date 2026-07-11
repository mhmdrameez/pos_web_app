import { useCartStore } from '../../stores/useCartStore'
import { formatRupeesFromString } from '../../utils/money'

export function AmountDisplay() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const [amount, quantity] = currentAmount.split('*')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-1 text-right">Amount</p>
      <p className="text-5xl lg:text-6xl font-bold text-gray-900 text-right tabular-nums">
        {quantity === undefined
          ? formatRupeesFromString(amount || '0')
          : `${formatRupeesFromString(amount || '0')} * ${quantity || '?'}`}
      </p>
    </div>
  )
}
