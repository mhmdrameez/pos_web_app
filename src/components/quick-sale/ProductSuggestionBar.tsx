import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useSuggestionUiStore } from '../../stores/useSuggestionUiStore'
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
  const amountLabel = <p className="text-xs text-gray-500 mb-1">Amount</p>

  if (!entry) return amountLabel

  function applyManualName(name: string) {
    productSuggestionEngine.learn({
      displayName: name,
      unitPricePaise: entry!.unitPricePaise,
      quantity: entry!.quantity,
      soldAt: Date.now(),
      weight: 3,
      source: 'manual',
    })
    pickAlternative(manualSuggestion(name))
    setChangeOpen(false)
  }

  const show = Boolean(best && !dismissed)

  return (
    <>
      {show && best ? (
        <div className="flex items-center gap-1.5 mb-1 h-5 min-w-0 overflow-hidden">
          <Lightbulb className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <p className="text-xs font-semibold text-indigo-950 truncate min-w-0">
            {best.displayName} — {Math.round(best.confidence * 100)}%
            {accepted ? <span className="ml-1 font-medium text-green-700">Accepted</span> : null}
          </p>
          {alternatives.slice(0, 2).map((option) => (
            <button
              key={option.productKey}
              type="button"
              onClick={() => pickAlternative(option)}
              className="text-[11px] px-1.5 py-0 rounded bg-white text-indigo-800 border border-indigo-100 hover:bg-indigo-100 shrink-0 max-w-[5.5rem] truncate"
            >
              {option.displayName}
            </button>
          ))}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <button type="button" className="text-[11px] font-semibold text-indigo-700 hover:underline" onClick={accept}>
              Accept
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-gray-600 hover:underline"
              onClick={() => setChangeOpen(true)}
            >
              Change
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-gray-500 hover:underline"
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
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-1">Amount</p>
      )}

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
