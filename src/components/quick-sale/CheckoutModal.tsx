import { useState } from 'react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCheckout } from '../../hooks/useCheckout'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatRupees, amountStringToPaise, calculateChange } from '../../utils/money'
import type { PaymentMethod } from '../../types'

export function CheckoutModal() {
  const isOpen = useAppStore((s) => s.isCheckoutModalOpen)
  const closeCheckoutModal = useAppStore((s) => s.closeCheckoutModal)
  const addToast = useAppStore((s) => s.addToast)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())
  const totalQty = useCartStore((s) => s.getItemCount())
  const itemCount = useCartStore((s) => s.items.length)
  const { completeSale } = useCheckout()

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const cashPaise = amountStringToPaise(cashAmount)
  const changePaise = calculateChange(cashPaise, grandTotal)
  const insufficientCash = paymentMethod === 'cash' && cashPaise > 0 && cashPaise < grandTotal

  async function handleComplete(shouldPrint: boolean) {
    if (paymentMethod === 'cash') {
      if (cashPaise < grandTotal) {
        addToast('error', 'Insufficient cash amount')
        return
      }
    }

    setIsProcessing(true)
    try {
      await completeSale(
        paymentMethod,
        paymentMethod === 'cash' ? cashPaise : undefined,
        shouldPrint,
      )
      setCashAmount('')
      setPaymentMethod('cash')
    } finally {
      setIsProcessing(false)
    }
  }

  const methods: { id: PaymentMethod; label: string }[] = [
    { id: 'cash', label: 'Cash' },
    { id: 'upi', label: 'UPI' },
    { id: 'card', label: 'Card' },
  ]

  return (
    <Modal open={isOpen} onClose={closeCheckoutModal} title="Checkout" size="md">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-center mb-3">
            <p className="text-sm text-gray-500">Amount Due</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatRupees(grandTotal)}</p>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-3">
            <span className="text-gray-500">{itemCount} line item{itemCount !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-gray-700">Total Qty: <span className="tabular-nums">{totalQty}</span></span>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {methods.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPaymentMethod(id)}
                className={`py-3 rounded-xl font-medium transition-colors ${
                  paymentMethod === id
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {paymentMethod === 'cash' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cash Received</label>
            <input
              type="text"
              inputMode="decimal"
              value={cashAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d.]/g, '')
                const parts = val.split('.')
                const cleaned =
                  parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val
                if (parts.length === 2 && parts[1].length > 2) return
                setCashAmount(cleaned)
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="0.00"
            />
            {cashPaise >= grandTotal && (
              <p className="text-green-600 text-sm mt-2 font-medium">
                Change: {formatRupees(changePaise)}
              </p>
            )}
            {insufficientCash && (
              <p className="text-red-500 text-sm mt-2">Insufficient amount</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            size="lg"
            disabled={isProcessing || insufficientCash}
            onClick={() => handleComplete(false)}
            className="w-full"
          >
            Complete Sale
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={isProcessing || insufficientCash}
            onClick={() => handleComplete(true)}
            className="w-full"
          >
            Complete and Print
          </Button>
        </div>
      </div>
    </Modal>
  )
}
