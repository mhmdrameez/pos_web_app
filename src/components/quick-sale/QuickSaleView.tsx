import { Menu, Printer, X } from 'lucide-react'
import { AmountDisplay } from './AmountDisplay'
import { NumericKeypad } from './NumericKeypad'
import { OrderPanel } from './OrderPanel'
import { useAppStore } from '../../stores/useAppStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

export function QuickSaleView() {
  const isCartDrawerOpen = useAppStore((s) => s.isCartDrawerOpen)
  const toggleCartDrawer = useAppStore((s) => s.toggleCartDrawer)
  const setCartDrawerOpen = useAppStore((s) => s.setCartDrawerOpen)
  const openPrinterSettings = useAppStore((s) => s.openPrinterSettings)

  useKeyboardShortcuts()

  return (
    <div className="flex flex-1 min-h-0 relative bg-white">
      <div className="flex-1 flex flex-col p-3 lg:p-4 min-w-0">
        <div className="flex items-center justify-between mb-4 md:hidden">
          <h2 className="text-lg font-semibold">Quick Sale</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openPrinterSettings}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-primary"
              aria-label="Printer settings"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={toggleCartDrawer}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              aria-label="Toggle cart"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="hidden md:flex justify-end mb-2">
          <button
            onClick={openPrinterSettings}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-primary hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            Printer
          </button>
        </div>
        <AmountDisplay />
        <NumericKeypad />
      </div>

      <OrderPanel className="hidden md:flex md:w-[280px] lg:w-[360px] xl:w-[390px] shrink-0" />

      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartDrawerOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold">Current Order</h2>
              <button onClick={() => setCartDrawerOpen(false)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <OrderPanel className="flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  )
}
