import { ShoppingCart, Zap, Bookmark } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import type { BottomTab } from '../../types'

const tabs: { id: BottomTab; label: string; icon: typeof ShoppingCart }[] = [
  { id: 'sale', label: 'Sale', icon: ShoppingCart },
  { id: 'quick-sale', label: 'Quick Sale', icon: Zap },
  { id: 'saved-orders', label: 'Saved Orders', icon: Bookmark },
]

export function BottomNav() {
  const activeTab = useAppStore((s) => s.activeBottomTab)
  const setActiveTab = useAppStore((s) => s.setActiveBottomTab)

  return (
    <nav className="flex items-center justify-around bg-white border-t border-gray-200 px-3 py-2 shrink-0 safe-area-bottom">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border text-sm font-semibold transition-colors ${
            activeTab === id
              ? 'bg-white border-primary text-primary shadow-sm'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </nav>
  )
}
