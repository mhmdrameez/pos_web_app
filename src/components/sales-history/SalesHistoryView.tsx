import { useEffect, useState } from 'react'
import { getCompletedSales } from '../../services/db/database'
import { useAppStore } from '../../stores/useAppStore'
import type { CompletedSale } from '../../types'
import { formatRupees } from '../../utils/money'

const paymentLabels = { cash: 'Cash', upi: 'UPI', card: 'Card' }

export function SalesHistoryView() {
  const [sales, setSales] = useState<CompletedSale[]>([])
  const [loading, setLoading] = useState(true)
  const addToast = useAppStore((s) => s.addToast)

  useEffect(() => {
    async function load() {
      try {
        const data = await getCompletedSales()
        setSales(data)
      } catch {
        addToast('error', 'Failed to load sales history')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [addToast])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Loading sales history...
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Sales History</h2>
      {sales.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No completed sales yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-3 pr-4 font-medium">Invoice</th>
                <th className="py-3 pr-4 font-medium">Date</th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">Payment</th>
                <th className="py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-900">{sale.invoiceNumber}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {new Date(sale.completedAt).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {sale.customer?.name ?? '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {paymentLabels[sale.paymentMethod]}
                  </td>
                  <td className="py-3 text-right font-semibold tabular-nums">
                    {formatRupees(sale.grandTotalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
