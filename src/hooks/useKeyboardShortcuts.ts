import { useEffect } from 'react'
import { useCartStore } from '../stores/useCartStore'

export function useKeyboardShortcuts() {
  const appendToAmount = useCartStore((s) => s.appendToAmount)
  const backspaceAmount = useCartStore((s) => s.backspaceAmount)
  const clearAmount = useCartStore((s) => s.clearAmount)
  const addItem = useCartStore((s) => s.addItem)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        addItem()
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        backspaceAmount()
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        clearAmount()
        return
      }

      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        appendToAmount(e.key)
        return
      }

      if (e.key === '.') {
        e.preventDefault()
        appendToAmount('.')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [appendToAmount, backspaceAmount, clearAmount, addItem])
}
