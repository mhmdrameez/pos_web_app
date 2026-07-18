import { useEffect, useState, useCallback } from 'react'
import {
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Send,
} from 'lucide-react'
import { getCompletedSales, markEmailSent, getSettings } from '../../services/db/database'
import { sendInvoiceEmail } from '../../services/email/emailService'
import { triggerDailyDigestNow } from '../../services/email/dailyDigestScheduler'
import { useAppStore } from '../../stores/useAppStore'
import type { CompletedSale } from '../../types'
import { formatRupees } from '../../utils/money'
import { Button } from '../ui/Button'

const paymentLabels: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' }

type SortDir = 'desc' | 'asc'

export function SalesHistoryView() {
  const [sales, setSales] = useState<CompletedSale[]>([])
  const [loading, setLoading] = useState(true)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendErrorId, setSendErrorId] = useState<string | null>(null)
  const [digestSending, setDigestSending] = useState(false)
  const [emailConfigured, setEmailConfigured] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const addToast = useAppStore((s) => s.addToast)
  const openAppSettings = useAppStore((s) => s.openAppSettings)

  const load = useCallback(async () => {
    try {
      const data = await getCompletedSales()
      // getCompletedSales already returns newest-first; apply sort preference
      setSales(data)
    } catch {
      addToast('error', 'Failed to load sales history')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
    // Check if email is configured
    getSettings().then((s) => {
      setEmailConfigured(!!s.emailSettings?.resendApiKey)
    })
  }, [load])

  const filteredSales = sales.filter((sale) => {
    if (!filterDate) return true
    const saleDate = new Date(sale.completedAt)
    const dateStr = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`
    return dateStr === filterDate
  })

  const sortedSales = [...filteredSales].sort((a, b) =>
    sortDir === 'desc' ? b.completedAt - a.completedAt : a.completedAt - b.completedAt,
  )

  function toggleSort() {
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
  }

  async function handleSendEmail(sale: CompletedSale) {
    if (sendingId) return
    setSendingId(sale.id)
    setSendErrorId(null)
    try {
      const settings = await getSettings()
      if (!settings.emailSettings?.resendApiKey) {
        addToast('error', 'Email not configured. Set up your Resend API key in App Settings.')
        openAppSettings()
        return
      }
      const result = await sendInvoiceEmail(sale, settings.emailSettings, settings.businessName)
      if (result.success) {
        const sentAt = Date.now()
        await markEmailSent(sale.id, sentAt)
        setSales((prev) =>
          prev.map((s) => (s.id === sale.id ? { ...s, emailSentAt: sentAt } : s)),
        )
        addToast('success', `Invoice ${sale.invoiceNumber} emailed!`)
      } else {
        setSendErrorId(sale.id)
        addToast('error', result.error ?? 'Failed to send email')
      }
    } catch {
      setSendErrorId(sale.id)
      addToast('error', 'Unexpected error sending email')
    } finally {
      setSendingId(null)
    }
  }

  async function handleSendDigest() {
    setDigestSending(true)
    try {
      const result = await triggerDailyDigestNow()
      if (result.success) {
        addToast('success', 'Daily report emailed!')
      } else {
        addToast('error', result.error ?? 'Failed to send daily report')
      }
    } finally {
      setDigestSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Loading sales history...
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-semibold text-gray-900">
          Sales History
          {sales.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {filteredSales.length} invoice{filteredSales.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="date-filter" className="text-sm text-gray-500 font-medium">Date:</label>
            <input
              id="date-filter"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Email not configured nudge */}
          {!emailConfigured && (
            <button
              type="button"
              onClick={openAppSettings}
              className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Mail className="w-3.5 h-3.5" />
              Set up email to send invoices
            </button>
          )}

          {/* Daily Report Button */}
          {emailConfigured && (
            <Button
              id="send-daily-report-btn"
              variant="secondary"
              size="sm"
              onClick={handleSendDigest}
              disabled={digestSending}
              className="flex items-center gap-2"
            >
              {digestSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {digestSending ? 'Sending…' : 'Send Daily Report'}
            </Button>
          )}
        </div>
      </div>

      {filteredSales.length === 0 ? (
        <p className="text-gray-400 text-center py-12">
          {sales.length === 0 ? 'No completed sales yet.' : 'No sales match the selected date.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-gray-500">
                <th className="py-3 pl-4 pr-4 font-medium">Invoice</th>
                {/* Clickable Date header */}
                <th className="py-3 pr-4 font-medium">
                  <button
                    id="sort-by-date-btn"
                    type="button"
                    onClick={toggleSort}
                    className="flex items-center gap-1 hover:text-gray-800 transition-colors group"
                  >
                    Date
                    {sortDir === 'desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
                    ) : sortDir === 'asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-40 group-hover:opacity-80" />
                    )}
                  </button>
                </th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">Payment</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium text-center">Email</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.map((sale) => {
                const isThisSending = sendingId === sale.id
                const hasError = sendErrorId === sale.id
                const wasSent = !!sale.emailSentAt

                return (
                  <tr
                    key={sale.id}
                    className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                  >
                    <td className="py-3 pl-4 pr-4 font-medium text-gray-900">
                      {sale.invoiceNumber}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                      {new Date(sale.completedAt).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{sale.customer?.name ?? '—'}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {paymentLabels[sale.paymentMethod] ?? sale.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-gray-900">
                      {formatRupees(sale.grandTotalPaise)}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      {isThisSending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400 mx-auto" />
                      ) : wasSent && !hasError ? (
                        <button
                          id={`resend-email-${sale.id}`}
                          type="button"
                          title={`Sent ${new Date(sale.emailSentAt!).toLocaleString('en-IN')} — click to resend`}
                          onClick={() => handleSendEmail(sale)}
                          disabled={!!sendingId}
                          className="inline-flex items-center gap-1 text-green-600 hover:text-indigo-600 transition-colors disabled:opacity-40 group"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                            Resend
                          </span>
                        </button>
                      ) : hasError ? (
                        <button
                          id={`retry-email-${sale.id}`}
                          type="button"
                          title="Failed — click to retry"
                          onClick={() => handleSendEmail(sale)}
                          disabled={!!sendingId}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                        >
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs">Retry</span>
                        </button>
                      ) : (
                        <button
                          id={`send-email-${sale.id}`}
                          type="button"
                          title="Send invoice by email"
                          onClick={() => handleSendEmail(sale)}
                          disabled={!!sendingId}
                          className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
