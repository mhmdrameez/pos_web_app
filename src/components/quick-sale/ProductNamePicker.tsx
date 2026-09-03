import { useEffect, useMemo, useState } from 'react'
import { productSuggestionEngine } from '../../services/suggestion/engine'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function ProductNamePicker({
  query,
  onQueryChange,
  onPick,
  placeholder = 'Search or type a new product name',
  compact = false,
}: {
  query: string
  onQueryChange: (value: string) => void
  onPick: (name: string) => void
  placeholder?: string
  compact?: boolean
}) {
  const trimmed = query.trim()
  const filtered = useMemo(() => {
    const known = productSuggestionEngine.getKnownProducts()
    if (!trimmed) return known
    const needle = trimmed.toLowerCase()
    return known.filter((item) => item.displayName.toLowerCase().includes(needle))
  }, [trimmed])
  const hasExact = filtered.some((item) => item.displayName.toLowerCase() === trimmed.toLowerCase())

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed) {
            event.preventDefault()
            onPick(trimmed)
          }
        }}
      />
      <div className={`overflow-y-auto space-y-1 ${compact ? 'max-h-28' : 'max-h-40'}`}>
        {filtered.map((item) => (
          <button
            key={item.productKey}
            type="button"
            onClick={() => onPick(item.displayName)}
            className="w-full text-left text-sm px-3 py-1.5 rounded-lg bg-white border border-gray-100 hover:bg-indigo-50 hover:border-indigo-200"
          >
            {item.displayName}
          </button>
        ))}
        {trimmed && !hasExact && (
          <button
            type="button"
            onClick={() => onPick(trimmed)}
            className="w-full text-left text-sm px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium"
          >
            Add “{trimmed}” as new product
          </button>
        )}
        {filtered.length === 0 && !trimmed && (
          <p className="text-xs text-gray-500 px-1">No saved products yet. Type a new name.</p>
        )}
      </div>
    </div>
  )
}

export function ProductNameModal({
  open,
  title = 'Select Product',
  initialName = '',
  onClose,
  onPick,
}: {
  open: boolean
  title?: string
  initialName?: string
  onClose: () => void
  onPick: (name: string) => void
}) {
  const [query, setQuery] = useState(initialName)

  useEffect(() => {
    if (open) setQuery(initialName)
  }, [open, initialName])

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-3">
        <ProductNamePicker
          query={query}
          onQueryChange={setQuery}
          onPick={onPick}
          placeholder="Product or cloth name"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!query.trim()} onClick={() => onPick(query.trim())}>
            Use This Name
          </Button>
        </div>
      </div>
    </Modal>
  )
}
