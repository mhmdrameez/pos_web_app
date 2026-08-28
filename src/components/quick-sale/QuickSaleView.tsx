import { useState } from 'react'
import { Printer, X, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Lightbulb, Receipt, ShoppingCart } from 'lucide-react'
import { AmountDisplay } from './AmountDisplay'
import { ProductSuggestionBar } from './ProductSuggestionBar'
import { NumericKeypad } from './NumericKeypad'
import { OrderPanel } from './OrderPanel'
import { OrderItemRow } from './OrderItemRow'
import { useAppStore } from '../../stores/useAppStore'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { useCartStore } from '../../stores/useCartStore'
import { useCheckout } from '../../hooks/useCheckout'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useProductSuggestion } from '../../hooks/useProductSuggestion'
import { Button } from '../ui/Button'
import { formatRupees } from '../../utils/money'

export function QuickSaleView() {
  const isCartDrawerOpen = useAppStore((s) => s.isCartDrawerOpen)
  const setCartDrawerOpen = useAppStore((s) => s.setCartDrawerOpen)
  const openPrinterSettings = useAppStore((s) => s.openPrinterSettings)
  const openCheckoutModal = useAppStore((s) => s.openCheckoutModal)
  const addToast = useAppStore((s) => s.addToast)
  const showSuggestions = usePrinterStore((s) => s.showSuggestions)
  const setShowSuggestions = usePrinterStore((s) => s.setShowSuggestions)

  const items = useCartStore((s) => s.items)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())
  const totalQty = useCartStore((s) => s.getItemCount())
  const editingSale = useCartStore((s) => s.editingSale)
  const { completeSale } = useCheckout()
  const [isPrinting, setIsPrinting] = useState(false)

  // Order panel collapse state — visible by default, collapsible on all sizes ≥ md
  const [isOrderOpen, setIsOrderOpen] = useState(true)
  // Mobile: whether the mini order list is expanded
  const [mobileCartExpanded, setMobileCartExpanded] = useState(true)

  useKeyboardShortcuts()
  useProductSuggestion()

  async function handleMobilePrint() {
    if (isPrinting) return
    if (items.length === 0) {
      addToast('error', 'Add items before printing')
      return
    }
    setIsPrinting(true)
    try {
      await completeSale('cash', grandTotal, true)
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div className="flex flex-1 min-h-0 relative bg-white">
      {/* ══════════════════════════════════════════════
          MOBILE PORTRAIT LAYOUT (< md)
          Vertical stack: header → keypad → order list → actions
         ══════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-h-0 md:hidden">

        {/* ── Mobile compact header ── */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Quick Sale</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className={`p-2 rounded-lg text-sm transition-colors ${
                showSuggestions
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-gray-100 text-gray-400'
              }`}
              aria-label={showSuggestions ? 'Turn off suggestions' : 'Turn on suggestions'}
            >
              <Lightbulb className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openPrinterSettings}
              className="p-2 rounded-lg bg-gray-100 text-primary"
              aria-label="Printer settings"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Keypad area (scrollable if needed) ── */}
        <div className="flex flex-col px-3 pt-1 shrink-0">
          <ProductSuggestionBar />
          <AmountDisplay />
        </div>
        <div className="px-3 pb-2 flex-1 min-h-0" style={{ minHeight: '180px', maxHeight: '45vh' }}>
          <NumericKeypad />
        </div>

        {/* ── Mobile inline order section ── */}
        <div className="shrink-0 border-t border-gray-200 bg-[#f3f4f7]">
          {/* Expandable header strip */}
          <button
            type="button"
            onClick={() => setMobileCartExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 active:bg-gray-200/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-900">
                {editingSale ? 'Editing Bill' : 'Orders'}
              </span>
              {items.length > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold">
                  {totalQty}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {grandTotal > 0 ? formatRupees(grandTotal) : '₹0'}
              </span>
              {mobileCartExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </button>

          {/* Expandable item list */}
          {mobileCartExpanded && (
            <div className="border-t border-gray-200/80">
              <div
                className="overflow-y-auto px-4 bg-[#e9ebef]"
                style={{ maxHeight: '25vh' }}
              >
                {items.length === 0 ? (
                  <div className="py-4 text-center text-gray-500 text-sm">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-1 text-gray-400" />
                    <p>Cart is empty</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <OrderItemRow
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      unitPricePaise={item.unitPricePaise}
                      quantity={item.quantity}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Action buttons — always visible */}
          <div className="grid grid-cols-2 gap-2 px-4 py-2.5 border-t border-gray-200/80">
            <Button
              variant="secondary"
              onClick={handleMobilePrint}
              disabled={isPrinting || items.length === 0}
              className="flex items-center justify-center gap-1.5 py-2.5 text-sm disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              {isPrinting ? 'Printing...' : 'Print'}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (items.length === 0) {
                  addToast('error', 'Add at least one item to bill')
                  return
                }
                openCheckoutModal()
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 text-sm"
            >
              <Receipt className="w-4 h-4" />
              {editingSale ? 'Save' : 'Bill'} {grandTotal > 0 ? formatRupees(grandTotal) : ''}
            </Button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          DESKTOP LAYOUT (md+)  — unchanged
         ══════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-1 md:min-h-0">
        {/* ── Keypad column ── */}
        <div className="flex-1 flex flex-col p-3 lg:p-4 min-w-0">
          <div className="flex justify-end gap-2 mb-2">
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

        {/* ── Collapse toggle button ── */}
        <div className="flex items-center">
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

        {/* ── Order panel ── */}
        {isOrderOpen && (
          <OrderPanel className="w-[360px] lg:w-[390px] shrink-0" />
        )}
      </div>

      {/* ── Mobile cart drawer (legacy fallback, kept for deep link access) ── */}
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
