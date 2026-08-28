import { useState } from 'react'
import { Menu, Printer, X, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react'
import { AmountDisplay } from './AmountDisplay'
import { ProductSuggestionBar } from './ProductSuggestionBar'
import { NumericKeypad } from './NumericKeypad'
import { OrderPanel } from './OrderPanel'
import { useAppStore } from '../../stores/useAppStore'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useProductSuggestion } from '../../hooks/useProductSuggestion'

export function QuickSaleView() {
  const isCartDrawerOpen = useAppStore((s) => s.isCartDrawerOpen)
  const toggleCartDrawer = useAppStore((s) => s.toggleCartDrawer)
  const setCartDrawerOpen = useAppStore((s) => s.setCartDrawerOpen)
  const openPrinterSettings = useAppStore((s) => s.openPrinterSettings)
  const showSuggestions = usePrinterStore((s) => s.showSuggestions)
  const setShowSuggestions = usePrinterStore((s) => s.setShowSuggestions)

  // Order panel collapse state — visible by default, collapsible on all sizes ≥ md
  const [isOrderOpen, setIsOrderOpen] = useState(true)

  useKeyboardShortcuts()
  useProductSuggestion()

  return (
    <div className="flex flex-1 min-h-0 relative bg-white">
      {/* ── Keypad column ── */}
      <div className="flex-1 flex flex-col p-3 lg:p-4 min-w-0">
        {/* Mobile header */}
        <div className="flex items-center justify-between mb-4 md:hidden">
          <h2 className="text-lg font-semibold">Quick Sale</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                showSuggestions
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              aria-label={showSuggestions ? 'Turn off suggestions' : 'Turn on suggestions'}
            >
              <Lightbulb className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={openPrinterSettings}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-primary text-sm font-medium"
              aria-label="Printer settings"
            >
              <Printer className="w-5 h-5" />
              <span>Printer Settings</span>
            </button>
            <button
              type="button"
              onClick={toggleCartDrawer}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              aria-label="Toggle cart"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="hidden md:flex justify-end gap-2 mb-2">
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
              showSuggestions
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
            }`}
            aria-label={showSuggestions ? 'Turn off suggestions' : 'Turn on suggestions'}
          >
            <Lightbulb className="w-4 h-4" />
            {showSuggestions ? 'Suggestions On' : 'Suggestions Off'}
          </button>
          <button
            type="button"
            onClick={openPrinterSettings}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-primary hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            Printer Settings
          </button>
        </div>

        <ProductSuggestionBar />
        <AmountDisplay />
        <NumericKeypad />
      </div>

      {/* ── Collapse toggle button (visible on md+) ── */}
      <div className="hidden md:flex items-center">
        <button
          onClick={() => setIsOrderOpen((v) => !v)}
          aria-label={isOrderOpen ? 'Collapse order panel' : 'Expand order panel'}
          className="
            relative z-10 -ml-3
            w-6 h-14 flex items-center justify-center
            bg-white border border-gray-200 rounded-full shadow-md
            text-gray-500 hover:text-primary hover:border-primary
            transition-colors
          "
        >
          {isOrderOpen ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* ── Order panel (collapsible on md+) ── */}
      {isOrderOpen && (
        <OrderPanel className="hidden md:flex w-[360px] lg:w-[390px] shrink-0" />
      )}

      {/* ── Mobile cart drawer ── */}
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
