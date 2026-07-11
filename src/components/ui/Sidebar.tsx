import {
  Zap,
  Bookmark,
  History,
  Printer,
  Settings,
} from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import type { SidebarView } from '../../types'

const navItems: { id: SidebarView; label: string; icon: typeof Zap }[] = [
  { id: 'quick-sale', label: 'Quick Sale', icon: Zap },
  { id: 'saved-orders', label: 'Saved Orders', icon: Bookmark },
  { id: 'sales-history', label: 'Sales History', icon: History },
  { id: 'printer-settings', label: 'Printer Settings', icon: Printer },
  { id: 'app-settings', label: 'Application Settings', icon: Settings },
]

export function Sidebar() {
  const activeView = useAppStore((s) => s.activeSidebarView)
  const setActiveView = useAppStore((s) => s.setActiveSidebarView)
  const openPrinterSettings = useAppStore((s) => s.openPrinterSettings)
  const openAppSettings = useAppStore((s) => s.openAppSettings)
  const businessName = useAppStore((s) => s.businessName)

  function handleNav(id: SidebarView) {
    if (id === 'printer-settings') {
      openPrinterSettings()
    } else if (id === 'app-settings') {
      openAppSettings()
    } else {
      setActiveView(id)
    }
  }

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 bg-gray-50 border-r border-gray-200 shrink-0">
      <div className="px-4 py-5 border-b border-gray-200">
        <h1 className="text-lg font-bold text-primary truncate">{businessName}</h1>
        <p className="text-xs text-gray-500 mt-1">Quick Sale POS</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNav(id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
              activeView === id
                ? 'bg-primary text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
