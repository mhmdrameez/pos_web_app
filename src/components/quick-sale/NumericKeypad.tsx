import { Delete } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { Button } from '../ui/Button'

export function NumericKeypad() {
  const appendToAmount = useCartStore((s) => s.appendToAmount)
  const backspaceAmount = useCartStore((s) => s.backspaceAmount)
  const clearAmount = useCartStore((s) => s.clearAmount)
  const addItem = useCartStore((s) => s.addItem)
  const addToast = useAppStore((s) => s.addToast)

  function handleDigit(key: string) {
    appendToAmount(key)
  }

  function handleAddItem() {
    if (!addItem()) {
      addToast('error', 'Enter a valid amount greater than zero')
    }
  }

  const digitBtn = (key: string) => (
    <Button
      key={key}
      variant="keypad"
      size="lg"
      onClick={() => handleDigit(key)}
      className="h-16 w-full text-xl font-medium"
    >
      {key}
    </Button>
  )

  return (
    <div className="grid grid-cols-4 gap-3 flex-1">
      {digitBtn('7')}
      {digitBtn('8')}
      {digitBtn('9')}
      <Button variant="keypad" size="lg" onClick={backspaceAmount} className="h-16 w-full">
        <Delete className="w-5 h-5 mx-auto" />
      </Button>

      {digitBtn('4')}
      {digitBtn('5')}
      {digitBtn('6')}
      <Button variant="keypad" size="lg" onClick={clearAmount} className="h-16 w-full text-base">
        Clear
      </Button>

      {digitBtn('1')}
      {digitBtn('2')}
      {digitBtn('3')}

      {digitBtn('0')}
      {digitBtn('00')}
      {digitBtn('.')}
      {digitBtn('*')}

      <button
        onClick={handleAddItem}
        className="col-span-4 h-16 bg-primary text-white rounded-lg text-lg font-semibold hover:bg-primary-hover active:bg-primary-hover shadow-sm"
      >
        Add Item
      </button>
    </div>
  )
}
