import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { formatRupees } from '../../utils/money'

interface OrderItemRowProps {
  id: string
  name: string
  unitPricePaise: number
  quantity: number
}

export function OrderItemRow({ id, name, unitPricePaise, quantity }: OrderItemRowProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const updateItemName = useCartStore((s) => s.updateItemName)
  const removeItem = useCartStore((s) => s.removeItem)
  const showConfirm = useAppStore((s) => s.showConfirm)

  function handleDecrease() {
    const result = updateQuantity(id, -1)
    if (result === 'confirm-remove') {
      showConfirm('Remove Item', `Remove ${name} from the order?`, () => removeItem(id))
    }
  }

  const isDecimalQty = !Number.isInteger(quantity)

  return (
    <div className="flex items-center gap-2 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <input
          defaultValue={name}
          onBlur={(event) => updateItemName(id, event.target.value)}
          className="w-full bg-transparent font-medium text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 -ml-1"
          aria-label="Item name"
        />
        <p className="text-sm text-gray-500">{formatRupees(unitPricePaise)} each</p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleDecrease}
          disabled={isDecimalQty}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Decrease quantity"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-10 text-center font-semibold tabular-nums text-sm">
          {Number.isInteger(quantity) ? quantity : quantity.toFixed(2)}
        </span>
        <button
          onClick={() => updateQuantity(id, 1)}
          disabled={isDecimalQty}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Increase quantity"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <p className="w-20 text-right font-semibold tabular-nums text-sm">
        {formatRupees(Math.round(unitPricePaise * quantity))}
      </p>

      <button
        onClick={() =>
          showConfirm('Remove Item', `Remove ${name} from the order?`, () => removeItem(id))
        }
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
        aria-label="Remove item"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
