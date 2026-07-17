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

  return (
    <div className="flex items-center gap-2 py-2 lg:py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <input
          defaultValue={name}
          onBlur={(event) => updateItemName(id, event.target.value)}
          className="w-full bg-transparent font-medium text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 -ml-1"
          aria-label="Item name"
        />
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
