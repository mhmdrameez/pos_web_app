import { Delete } from 'lucide-react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { Button } from '../ui/Button'

export function NumericKeypad() {
  const appendToAmount = useCartStore((s) => s.appendToAmount)
  const backspaceAmount = useCartStore((s) => s.backspaceAmount)
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
      className="h-full min-h-11 w-full text-2xl lg:text-3xl font-normal rounded-xl"
    >
      {key}
    </Button>
  )

  return (
    <div className="grid grid-cols-4 grid-rows-4 gap-2.5 lg:gap-3 flex-1 min-h-0">
      {/* Row 1 */}
      {digitBtn('7')}
      {digitBtn('8')}
      {digitBtn('9')}
      <Button
        variant="keypad"
        size="lg"
        onClick={backspaceAmount}
        className="h-full min-h-11 w-full rounded-xl"
      >
        <Delete className="w-7 h-7 mx-auto" />
      </Button>

      {/* Row 2 */}
      {digitBtn('4')}
      {digitBtn('5')}
      {digitBtn('6')}
      {/* × — internally appends '*' which the store uses for qty multiplication */}
      <Button
        variant="keypad"
        size="lg"
        onClick={() => handleDigit('*')}
        className="h-full min-h-11 w-full text-2xl lg:text-3xl font-normal rounded-xl"
      >
        ×
      </Button>

      {/* Row 3 */}
      {digitBtn('1')}
      {digitBtn('2')}
      {digitBtn('3')}
      {/* Add Item — spans rows 3 & 4 (tall button) */}
      <button
        onClick={handleAddItem}
        className="row-span-2 h-full min-h-11 w-full bg-[#1e5790] text-white rounded-xl text-base font-semibold hover:bg-primary-hover active:bg-primary-hover shadow-sm"
      >
        Add
        <br />
        Item
      </button>

      {/* Row 4 */}
      {digitBtn('0')}
      {digitBtn('00')}
      {digitBtn('.')}
      {/* col 4 of row 4 is occupied by row-span-2 Add Item above */}
    </div>
  )
}
