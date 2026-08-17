import { XCircle } from 'lucide-react'
import type { CompletedSale } from '../../types'
import { formatRupees } from '../../utils/money'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const paymentLabels: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' }

interface SaleDetailModalProps {
  sale: CompletedSale | null
  open: boolean
  onClose: () => void
  onCancel?: (sale: CompletedSale) => void
}

export function SaleDetailModal({ sale, open, onClose, onCancel }: SaleDetailModalProps) {
  if (!sale) return null

  const isCancelled = sale.status === 'cancelled'
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invoice ${sale.invoiceNumber}`}
      size="lg"
    >
      <div className="space-y-5">
        {isCancelled && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <XCircle className="w-4 h-4 shrink-0" />
            This bill has been cancelled
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-0.5">Date</p>
            <p className="font-medium text-gray-900">
              {new Date(sale.completedAt).toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Payment</p>
            <p className="font-medium text-gray-900">
              {paymentLabels[sale.paymentMethod] ?? sale.paymentMethod}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Order</p>
            <p className="font-medium text-gray-900">{sale.orderNumber}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Status</p>
            <p className="font-medium capitalize text-gray-900">{sale.status}</p>
          </div>
        </div>

        {sale.customer && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm">
            <p className="text-gray-500 mb-1">Customer</p>
            <p className="font-medium text-gray-900">{sale.customer.name}</p>
            <p className="text-gray-600">{sale.customer.phone}</p>
            {sale.customer.email && (
              <p className="text-gray-600">{sale.customer.email}</p>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Items ({itemCount})
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="py-2.5 pl-3 pr-2 font-medium">Item</th>
                  <th className="py-2.5 px-2 font-medium text-center">Qty</th>
                  <th className="py-2.5 px-2 font-medium text-right">Price</th>
                  <th className="py-2.5 pr-3 pl-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-50">
                    <td className="py-2.5 pl-3 pr-2 text-gray-900">{item.name}</td>
                    <td className="py-2.5 px-2 text-center text-gray-600 tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-600 tabular-nums">
                      {formatRupees(item.unitPricePaise)}
                    </td>
                    <td className="py-2.5 pr-3 pl-2 text-right font-medium text-gray-900 tabular-nums">
                      {formatRupees(item.unitPricePaise * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatRupees(sale.subtotalPaise)}</span>
          </div>
          {sale.discountPaise > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Discount</span>
              <span className="tabular-nums">-{formatRupees(sale.discountPaise)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-1">
            <span>Grand Total</span>
            <span className={`tabular-nums ${isCancelled ? 'line-through text-gray-400' : ''}`}>
              {formatRupees(sale.grandTotalPaise)}
            </span>
          </div>
          {sale.paymentMethod === 'cash' && sale.amountPaidPaise != null && (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Amount Paid</span>
                <span className="tabular-nums">{formatRupees(sale.amountPaidPaise)}</span>
              </div>
              {sale.changePaise != null && sale.changePaise > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Change</span>
                  <span className="tabular-nums">{formatRupees(sale.changePaise)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {sale.emailSentAt && (
          <p className="text-xs text-gray-400">
            Invoice emailed on {new Date(sale.emailSentAt).toLocaleString('en-IN')}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {!isCancelled && onCancel && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onCancel(sale)}
              className="flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Cancel Bill
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
