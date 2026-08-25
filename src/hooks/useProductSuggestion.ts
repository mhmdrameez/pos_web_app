import { useEffect } from 'react'
import { parseAmountAndQuantity } from '../utils/money'
import { useCartStore } from '../stores/useCartStore'
import { useSuggestionUiStore } from '../stores/useSuggestionUiStore'
import { productSuggestionEngine } from '../services/suggestion/engine'
import { cartProductKeys } from '../services/suggestion'

export function useProductSuggestion() {
  const currentAmount = useCartStore((s) => s.currentAmount)
  const items = useCartStore((s) => s.items)
  const setResult = useSuggestionUiStore((s) => s.setResult)
  const reset = useSuggestionUiStore((s) => s.reset)

  useEffect(() => {
    const entry = parseAmountAndQuantity(currentAmount)
    if (!entry) {
      reset()
      return
    }

    const result = productSuggestionEngine.suggest({
      unitPricePaise: entry.unitPricePaise,
      quantity: entry.quantity,
      cartProductKeys: cartProductKeys(items),
    })

    setResult(`${entry.unitPricePaise}:${entry.quantity}`, result.best, result.alternatives)
  }, [currentAmount, items, setResult, reset])
}
