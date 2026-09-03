import {
  Menu,
  Calculator,
  PackagePlus,
  History,
  Printer,
  Settings,
  Ticket,
} from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import type { SidebarView } from '../../types'
import { NetworkStatusLED } from './NetworkStatusLED'

const navItems: { id: SidebarView; label: string; icon: typeof History }[] = [
  { id: 'quick-sale', label: 'Quick Sale', icon: Calculator },
  { id: 'products', label: 'Add Products / Catalog', icon: PackagePlus },
  { id: 'coupons', label: 'Coupons', icon: Ticket },
  { id: 'sales-history', label: 'Sales History', icon: History },
  { id: 'printer-settings', label: 'Printer Settings', icon: Printer },
  { id: 'app-settings', label: 'Application Settings', icon: Settings },
]

export function Sidebar() {
  const activeView = useAppStore((s) => s.activeSidebarView)
  const setActiveView = useAppStore((s) => s.setActiveSidebarView)
  const closePrinterSettings = useAppStore((s) => s.closePrinterSettings)
  const openAppSettings = useAppStore((s) => s.openAppSettings)

  function handleNav(id: SidebarView) {
    if (id === 'printer-settings') {
      closePrinterSettings()
      setActiveView('quick-sale')
      return
    }
    if (id === 'app-settings') {
      openAppSettings()
    } else {
      setActiveView(id)
    }
  }

  return (
    <aside className="hidden md:flex flex-col items-center w-18 bg-[#f3f4f7] border-r border-gray-200 shrink-0 py-3">
      <div className="w-12 h-12 bg-white rounded-xl grid place-items-center shadow-sm mb-4">
        <Menu className="w-6 h-6 text-gray-700" />
      </div>
      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNav(id)}
            title={label}
            aria-label={label}
            className={`w-12 h-12 grid place-items-center rounded-xl transition-colors ${
              activeView === id
                ? 'bg-white text-primary shadow-sm ring-1 ring-primary/10'
                : 'text-gray-500 hover:bg-white hover:text-primary'
            }`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-2">
        {/* Network LED indicator */}
        <NetworkStatusLED />
        <div className="w-12 h-12 rounded-xl bg-primary text-white grid place-items-center text-[10px] font-bold tracking-tight">
          POS
        </div>
        <span className="text-[9px] text-gray-400 tabular-nums leading-none">
          v{__APP_VERSION__}
        </span>
      </div>
    </aside>
  )
}
