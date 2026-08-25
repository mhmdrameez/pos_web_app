import { create } from 'zustand'
import type { RankedSuggestion } from '../types/suggestion'

interface SuggestionUiState {
  queryKey: string
  best: RankedSuggestion | null
  alternatives: RankedSuggestion[]
  dismissed: boolean
  accepted: boolean
  changeOpen: boolean
  setResult: (queryKey: string, best: RankedSuggestion | null, alternatives: RankedSuggestion[]) => void
  accept: () => void
  dismiss: () => void
  pickAlternative: (suggestion: RankedSuggestion) => void
  setChangeOpen: (open: boolean) => void
  reset: () => void
}

export const useSuggestionUiStore = create<SuggestionUiState>((set, get) => ({
  queryKey: '',
  best: null,
  alternatives: [],
  dismissed: false,
  accepted: false,
  changeOpen: false,

  setResult: (queryKey, best, alternatives) => {
    const current = get()
    if (current.queryKey === queryKey) {
      set({ best, alternatives })
      return
    }
    set({
      queryKey,
      best,
      alternatives,
      dismissed: false,
      accepted: false,
    })
  },

  accept: () => set({ accepted: true, dismissed: false }),
  dismiss: () => set({ dismissed: true, accepted: false }),
  pickAlternative: (suggestion) =>
    set((state) => ({
      best: suggestion,
      alternatives: [state.best, ...state.alternatives.filter((item) => item.productKey !== suggestion.productKey)].filter(
        (item): item is RankedSuggestion => Boolean(item),
      ),
      accepted: true,
      dismissed: false,
    })),
  setChangeOpen: (open) => set({ changeOpen: open }),
  reset: () =>
    set({
      queryKey: '',
      best: null,
      alternatives: [],
      dismissed: false,
      accepted: false,
      changeOpen: false,
    }),
}))

export function resolveAddItemName(): { name?: string; source?: 'suggested' | 'manual' } {
  const state = useSuggestionUiStore.getState()
  if (state.dismissed || !state.best) return {}
  if (state.accepted) return { name: state.best.displayName, source: 'manual' }
  if (state.best.strength === 'suggested') return { name: state.best.displayName, source: 'suggested' }
  return {}
}
