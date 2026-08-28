import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useSuggestionUiStore } from '../../stores/useSuggestionUiStore'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { parseAmountAndQuantity } from '../../utils/money'
import { productSuggestionEngine } from '../../services/suggestion/engine'
import { formatDisplayName, normalizeProductKey } from '../../services/suggestion/productName'
import type { RankedSuggestion } from '../../types/suggestion'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

function manualSuggestion(name: string): RankedSuggestion {
  return {
    productKey: normalizeProductKey(name),
    displayName: formatDisplayName(name),
    confidence: 1,
    strength: 'suggested',
    inferredUnit: 'unknown',
    breakdown: { price: 1, frequency: 1, quantity: 1, recency: 1, association: 0 },
  }
}

export function ProductSuggestionBar() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const showSuggestions = usePrinterStore((s) => s.showSuggestions)
  const best = useSuggestionUiStore((s) => s.best)
  const alternatives = useSuggestionUiStore((s) => s.alternatives)
  const dismissed = useSuggestionUiStore((s) => s.dismissed)
  const accepted = useSuggestionUiStore((s) => s.accepted)
  const changeOpen = useSuggestionUiStore((s) => s.changeOpen)
  const accept = useSuggestionUiStore((s) => s.accept)
  const dismiss = useSuggestionUiStore((s) => s.dismiss)
  const pickAlternative = useSuggestionUiStore((s) => s.pickAlternative)
  const setChangeOpen = useSuggestionUiStore((s) => s.setChangeOpen)

  const entry = parseAmountAndQuantity(currentAmount)

  function applyManualName(name: string) {
    if (!entry) return
    productSuggestionEngine.learn({
      displayName: name,
      unitPricePaise: entry.unitPricePaise,
      quantity: entry.quantity,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    pickAlternative(manualSuggestion(name))
    setChangeOpen(false)
  }

  const show = Boolean(showSuggestions !== false && entry && best && !dismissed)

  return (
    <>
      <div className="mb-2 min-h-12">
        {show && best && entry ? (
          <div className="flex items-center gap-2 min-h-12 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5">
            <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" />
            <p className="text-sm font-semibold text-indigo-950 truncate min-w-0">
              {best.displayName} — {Math.round(best.confidence * 100)}%
              {accepted ? <span className="ml-1.5 text-xs font-medium text-green-700">Accepted</span> : null}
            </p>
            {alternatives.slice(0, 2).map((option) => (
              <button
                key={option.productKey}
                type="button"
                onClick={() => pickAlternative(option)}
                className="text-xs px-2 py-1 rounded-lg bg-white text-indigo-800 border border-indigo-100 hover:bg-indigo-100 shrink-0 max-w-[6rem] truncate"
              >
                {option.displayName}
              </button>
            ))}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Button size="sm" variant="primary" className="text-xs py-1.5 px-3" onClick={accept}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" className="text-xs py-1.5 px-3" onClick={() => setChangeOpen(true)}>
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs py-1.5 px-3"
                onClick={() => {
                  productSuggestionEngine.learn({
                    displayName: best.displayName,
                    unitPricePaise: entry.unitPricePaise,
                    quantity: entry.quantity,
                    soldAt: Date.now(),
                    weight: 1,
                    source: 'rejected',
                  })
                  dismiss()
                }}
              >
                Not this
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ChangeProductModal open={changeOpen} onClose={() => setChangeOpen(false)} onPick={applyManualName} />
    </>
  )
}

function ChangeProductModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (name: string) => void
}) {
  const [name, setName] = useState('')
  const known = productSuggestionEngine.getKnownProducts()
  const filtered = name.trim()
    ? known.filter((item) => item.displayName.toLowerCase().includes(name.trim().toLowerCase()))
    : known

  return (
    <Modal open={open} onClose={onClose} title="Change Product" size="sm">
      <div className="space-y-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Product or cloth name"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {filtered.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.productKey}
                type="button"
                onClick={() => onPick(item.displayName)}
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                {item.displayName}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onPick(name.trim())}>
            Use This Name
          </Button>
        </div>
      </div>
    </Modal>
  )
}
