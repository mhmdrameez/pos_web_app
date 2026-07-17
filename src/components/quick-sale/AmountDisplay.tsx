import { useCartStore } from '../../stores/useCartStore'
import { formatRupees, formatRupeesFromString, parseAmountAndQuantity } from '../../utils/money'

export function AmountDisplay() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const hasMultiply = currentAmount.includes('*')
  const [priceStr, qtyStr = ''] = currentAmount.split('*')
  const entry = parseAmountAndQuantity(currentAmount)

  // Price side: formatted rupee string
  const formattedPrice = priceStr
    ? priceStr.endsWith('.')
      ? `${formatRupeesFromString(priceStr)}.`
      : formatRupeesFromString(priceStr)
    : '₹0'

  // Total when both price and qty are present
  const total =
    entry && hasMultiply && qtyStr !== ''
      ? priceStr.includes('.')
        ? formatRupees(entry.unitPricePaise * entry.quantity)
        : formatRupeesFromString(String((entry.unitPricePaise * entry.quantity) / 100))
      : null

  return (
    <div className="bg-[#f5f6fa] rounded-xl border border-gray-100 px-5 py-3 mb-3">
      <p className="text-xs text-gray-500 mb-1">Amount</p>

      {hasMultiply ? (
        /* Formula view: e.g.  ₹200  ×  2  =  ₹400 */
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl lg:text-3xl font-semibold text-gray-900 tabular-nums">
            {formattedPrice}
          </span>
          <span className="text-xl lg:text-2xl font-normal text-gray-400">×</span>
          <span className="text-2xl lg:text-3xl font-semibold text-gray-900 tabular-nums">
            {qtyStr || '?'}
          </span>
          {total && (
            <>
              <span className="text-base text-gray-400">=</span>
              <span className="text-xl font-bold text-[#1e5790] tabular-nums">{total}</span>
            </>
          )}
        </div>
      ) : (
        /* Normal view */
        <p className="text-2xl lg:text-3xl font-semibold text-gray-900 tabular-nums">
          {formattedPrice}
        </p>
      )}
    </div>
  )
}
