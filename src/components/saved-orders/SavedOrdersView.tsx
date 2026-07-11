import { useEffect, useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import { getSavedOrders, deleteSavedOrder } from '../../services/db/database'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import type { SavedOrder } from '../../types'
import { formatRupees } from '../../utils/money'
import { Button } from '../ui/Button'

export function SavedOrdersView() {
  const [orders, setOrders] = useState<SavedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const loadCart = useCartStore((s) => s.loadCart)
  const setActiveView = useAppStore((s) => s.setActiveSidebarView)
  const showConfirm = useAppStore((s) => s.showConfirm)
  const addToast = useAppStore((s) => s.addToast)

  async function loadOrders() {
    setLoading(true)
    try {
      const data = await getSavedOrders()
      setOrders(data)
    } catch {
      addToast('error', 'Failed to load saved orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  function handleRestore(order: SavedOrder) {
    loadCart({
      items: order.items,
      customer: order.customer ?? null,
      discountPaise: order.discountPaise,
    })
    setActiveView('quick-sale')
    addToast('success', `Order ${order.orderNumber} restored`)
  }

  function handleDelete(id: string, orderNumber: string) {
    showConfirm('Delete Order', `Delete saved order ${orderNumber}?`, async () => {
      try {
        await deleteSavedOrder(id)
        await loadOrders()
        addToast('success', 'Order deleted')
      } catch {
        addToast('error', 'Failed to delete order')
      }
    })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Loading saved orders...
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Saved Orders</h2>
      {orders.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No saved orders yet.</p>
      ) : (
        <div className="grid gap-3 max-w-2xl">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(order.updatedAt).toLocaleString('en-IN')}
                  </p>
                  {order.customer && (
                    <p className="text-sm text-gray-600 mt-1">{order.customer.name}</p>
                  )}
                </div>
                <p className="font-bold text-primary tabular-nums">
                  {formatRupees(order.grandTotalPaise)}
                </p>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {order.items.length} item{order.items.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleRestore(order)}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDelete(order.id, order.orderNumber)}
                  className="flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
