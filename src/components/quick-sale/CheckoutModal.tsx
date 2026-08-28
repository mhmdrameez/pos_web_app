import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCheckout } from '../../hooks/useCheckout'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatRupees, amountStringToPaise, calculateChange, paiseToRupees } from '../../utils/money'
import { getCouponByCode } from '../../services/db/database'
import type { PaymentMethod } from '../../types'

export function CheckoutModal() {
  const isOpen = useAppStore((s) => s.isCheckoutModalOpen)
  const closeCheckoutModal = useAppStore((s) => s.closeCheckoutModal)
  const addToast = useAppStore((s) => s.addToast)
  const grandTotal = useCartStore((s) => s.getGrandTotalPaise())
  const totalQty = useCartStore((s) => s.getItemCount())
  const itemCount = useCartStore((s) => s.items.length)
  const editingSale = useCartStore((s) => s.editingSale)
  const { completeSale } = useCheckout()

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | undefined>()
  const [appliedCouponDiscount, setAppliedCouponDiscount] = useState(0)
  const [issueCouponForChange, setIssueCouponForChange] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editingSale) {
      setPaymentMethod(editingSale.paymentMethod)
      if (editingSale.paymentMethod === 'cash' && editingSale.amountPaidPaise != null) {
        setCashAmount(String(paiseToRupees(editingSale.amountPaidPaise)))
      } else {
        setCashAmount('')
      }
    } else {
      setPaymentMethod('cash')
      setCashAmount('')
      setAppliedCouponCode(undefined)
      setAppliedCouponDiscount(0)
      setCouponInput('')
      setIssueCouponForChange(false)
    }
  }, [isOpen, editingSale])

  const effectiveGrandTotal = Math.max(0, grandTotal - appliedCouponDiscount)
  const cashPaise = amountStringToPaise(cashAmount)
  const changePaise = calculateChange(cashPaise, effectiveGrandTotal)
  const insufficientCash = paymentMethod === 'cash' && cashPaise > 0 && cashPaise < effectiveGrandTotal

  async function handleApplyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    const coupon = await getCouponByCode(code)
    if (coupon && coupon.status === 'active') {
      setAppliedCouponCode(code)
      setAppliedCouponDiscount(coupon.amountPaise)
      setCouponInput('')
      addToast('success', 'Coupon applied')
    } else {
      addToast('error', 'Invalid or already used coupon code')
    }
  }

  function handleRemoveCoupon() {
    setAppliedCouponCode(undefined)
    setAppliedCouponDiscount(0)
  }

  async function handleComplete(shouldPrint: boolean) {
    if (paymentMethod === 'cash') {
      if (cashPaise < effectiveGrandTotal) {
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
        undefined,
        issueCouponForChange,
        appliedCouponCode
      )
      setCashAmount('')
      setPaymentMethod('cash')
      setAppliedCouponCode(undefined)
      setAppliedCouponDiscount(0)
      setIssueCouponForChange(false)
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
    <Modal
      open={isOpen}
      onClose={closeCheckoutModal}
      title={editingSale ? `Update ${editingSale.invoiceNumber}` : 'Checkout'}
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-center mb-3">
            <p className="text-sm text-gray-500">Amount Due</p>
            {appliedCouponDiscount > 0 ? (
              <div className="flex flex-col items-center gap-1 mt-1">
                <span className="text-xl text-gray-400 line-through tabular-nums">{formatRupees(grandTotal)}</span>
                <span className="text-green-600 text-sm font-medium">Coupon applied: -{formatRupees(appliedCouponDiscount)}</span>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatRupees(effectiveGrandTotal)}</p>
              </div>
            ) : (
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatRupees(grandTotal)}</p>
            )}
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-3">
            <span className="text-gray-500">{itemCount} line item{itemCount !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-gray-700">Total Qty: <span className="tabular-nums">{totalQty}</span></span>
          </div>
        </div>

        {!appliedCouponCode ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Coupon Code"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            />
            <Button variant="secondary" onClick={handleApplyCoupon} disabled={!couponInput.trim()}>
              Apply
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-lg border border-green-200">
            <span className="text-sm font-medium text-green-800">Coupon {appliedCouponCode}</span>
            <button onClick={handleRemoveCoupon} className="text-sm text-green-700 hover:text-green-900 underline">Remove</button>
          </div>
        )}

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
            {cashPaise >= effectiveGrandTotal && (
              <div className="mt-2 space-y-2">
                <p className="text-green-600 text-sm font-medium">
                  Change: {formatRupees(changePaise)}
                </p>
                {changePaise > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={issueCouponForChange}
                      onChange={(e) => setIssueCouponForChange(e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Issue Change as Store Credit (Coupon)</span>
                  </label>
                )}
              </div>
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
            {editingSale ? 'Save Bill' : 'Complete Sale'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={isProcessing || insufficientCash}
            onClick={() => handleComplete(true)}
            className="w-full"
          >
            {editingSale ? 'Save and Print' : 'Complete and Print'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
