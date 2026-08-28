import { useEffect, useState } from 'react'
import { Ticket, Plus, Tag } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { formatMoney } from '../../utils/money'
import { generateId } from '../../utils/generateId'
import { getAllCoupons, createCoupon } from '../../services/db/database'
import type { Coupon } from '../../types'
import { useAppStore } from '../../stores/useAppStore'

export function CouponsView() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const addToast = useAppStore((s) => s.addToast)

  async function loadCoupons() {
    const data = await getAllCoupons()
    setCoupons(data)
  }

  useEffect(() => {
    void loadCoupons()
  }, [])

  function generateCode() {
    // Generate a code like A4X9-B2M1
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-'
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      addToast('error', 'Please enter a valid amount')
      return
    }

    const code = generateCode()
    const newCoupon: Coupon = {
      id: generateId(),
      code,
      amountPaise: Math.round(amount * 100),
      status: 'active',
      createdAt: Date.now(),
    }

    await createCoupon(newCoupon)
    addToast('success', `Coupon created: ${code}`)
    setIsModalOpen(false)
    setAmountStr('')
    void loadCoupons()
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f3f4f7] md:bg-white overflow-hidden">
      <header className="px-4 py-3 md:px-6 md:py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Ticket className="w-6 h-6 text-primary" />
          Store Credit & Coupons
        </h1>
        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Issue Coupon</span>
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f3f4f7] md:bg-white">
        {coupons.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
            <Tag className="w-16 h-16 opacity-20" />
            <p className="text-lg">No coupons issued yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">
                      Code
                    </div>
                    <div className="text-xl font-bold font-mono tracking-wide text-gray-900">
                      {coupon.code}
                    </div>
                  </div>
                  <div
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      coupon.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : coupon.status === 'used'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {coupon.status.toUpperCase()}
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="text-xs text-gray-500 mb-0.5">Value</div>
                  <div className="text-2xl font-bold text-primary">
                    {formatMoney(coupon.amountPaise)}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                  <span>Issued: {new Date(coupon.createdAt).toLocaleDateString()}</span>
                  {coupon.usedAt && <span>Used: {new Date(coupon.usedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Issue Store Credit / Coupon"
        size="sm"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full text-xl p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Generate Code
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
