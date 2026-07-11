import { useAppStore } from '../../stores/useAppStore'
import type { BottomTab } from '../../types'

const tabs: { id: BottomTab; label: string }[] = [
  { id: 'sale', label: 'Sale' },
  { id: 'quick-sale', label: 'Quick Sale' },
  { id: 'saved-orders', label: 'Saved Orders' },
]

export function BottomNav() {
  const activeTab = useAppStore((s) => s.activeBottomTab)
  const setActiveTab = useAppStore((s) => s.setActiveBottomTab)

  return (
    <nav className="flex items-center justify-around bg-white border-t border-gray-200 px-2 py-2 shrink-0 safe-area-bottom">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === id
              ? 'bg-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
