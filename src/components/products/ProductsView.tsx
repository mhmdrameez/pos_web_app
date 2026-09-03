import { useState, useEffect, useRef } from 'react'
import {
  PackagePlus,
  Search,
  Trash2,
  Sparkles,
  Calculator,
  Tag,
  ArrowRight,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import {
  addManualProduct,
  removeManualProduct,
  getKnownProductStats,
  mergeDuplicateProducts,
} from '../../services/suggestion'
import { normalizeProductKey } from '../../services/suggestion/productName'
import { useAppStore } from '../../stores/useAppStore'
import { formatRupees, rupeesToPaise } from '../../utils/money'
import type { ProductStat } from '../../types/suggestion'
import { Button } from '../ui/Button'

export function ProductsView() {
  const [products, setProducts] = useState<ProductStat[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [productName, setProductName] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const addToast = useAppStore((s) => s.addToast)
  const showConfirm = useAppStore((s) => s.showConfirm)
  const setActiveView = useAppStore((s) => s.setActiveSidebarView)

  function refreshProducts() {
    setProducts(getKnownProductStats())
  }

  useEffect(() => {
    void mergeDuplicateProducts().then((mergedCount) => {
      refreshProducts()
      if (mergedCount > 0) {
        addToast('success', `Merged ${mergedCount} duplicate product name${mergedCount === 1 ? '' : 's'}`)
      }
    })
  }, [addToast])

  async function handleAddProduct(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const trimmedName = productName.trim()
    const parsedPrice = parseFloat(priceInput)

    if (!trimmedName) {
      addToast('error', 'Please enter a product name')
      nameInputRef.current?.focus()
      return
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      addToast('error', 'Please enter a valid price greater than 0')
      return
    }

    const pricePaise = rupeesToPaise(parsedPrice)
    setIsSaving(true)

    try {
      const result = await addManualProduct(trimmedName, pricePaise)
      refreshProducts()
      if (result.merged) {
        addToast('info', `"${result.displayName}" already exists — duplicates were merged`)
      } else {
        addToast('success', `"${result.displayName}" added at ₹${parsedPrice}`)
      }
      setJustAddedKey(normalizeProductKey(result.displayName))
      setProductName('')
      setPriceInput('')
      nameInputRef.current?.focus()
    } catch {
      addToast('error', 'Failed to save product suggestion')
    } finally {
      setIsSaving(false)
    }
  }

  function handleDelete(stat: ProductStat) {
    showConfirm(
      'Remove Product Suggestion',
      `Are you sure you want to remove "${stat.displayName}" from suggestions?`,
      async () => {
        try {
          await removeManualProduct(stat.productKey)
          refreshProducts()
          addToast('success', `Removed "${stat.displayName}" from suggestions`)
        } catch {
          addToast('error', 'Failed to remove product')
        }
      },
    )
  }

  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase().trim()
    return (
      p.displayName.toLowerCase().includes(query) ||
      (p.sumPricePaise / p.totalCount / 100).toString().includes(query)
    )
  })

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-y-auto">
      {/* ── Top Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:px-6 md:py-5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-6xl mx-auto">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-primary shadow-xs">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  Product Catalog & Suggestions
                </h1>
                <p className="text-xs text-gray-500">
                  Products saved here instantly auto-suggest in Quick Sale when typing their price
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setActiveView('quick-sale')}
            className="flex items-center gap-1.5 shadow-sm"
          >
            <Calculator className="w-4 h-4" />
            <span>Go to Quick Sale</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* ── Main Content Container ── */}
      <div className="p-4 md:p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* ── Section: Quick Add Form ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900 text-sm">Add New Product</h2>
            </div>
            <span className="text-xs text-gray-400 font-medium">Fast Entry (Press Enter to Save)</span>
          </div>

          <form onSubmit={handleAddProduct} className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              {/* Product Name */}
              <div className="sm:col-span-6 space-y-1.5">
                <label htmlFor="product-name" className="block text-xs font-semibold text-gray-700">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={nameInputRef}
                    id="product-name"
                    type="text"
                    autoFocus
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Cotton Shirt, Denim Jeans, Saree"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Price */}
              <div className="sm:col-span-4 space-y-1.5">
                <label htmlFor="product-price" className="block text-xs font-semibold text-gray-700">
                  Price (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="text-gray-400 font-bold absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                    ₹
                  </span>
                  <input
                    id="product-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all tabular-nums"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSaving || !productName.trim() || !priceInput.trim()}
                  className="w-full py-2.5 font-semibold text-sm flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Product'}</span>
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* ── Section: Saved Products List ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 text-sm">Registered Products & Suggestions</h2>
              <span className="px-2 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full">
                {products.length} {products.length === 1 ? 'product' : 'products'}
              </span>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {products.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                <PackagePlus className="w-7 h-7" />
              </div>
              <p className="text-gray-900 font-semibold text-base mb-1">No products added yet</p>
              <p className="text-gray-500 text-xs max-w-sm mx-auto mb-4">
                Add your frequently sold items above with their price. When billing in Quick Sale, entering their price will automatically suggest the item name!
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              No products found matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Product Name</th>
                    <th className="px-5 py-3 text-right">Default / Avg Price</th>
                    <th className="px-5 py-3 text-center">Frequency / Weight</th>
                    <th className="px-5 py-3 text-center">Last Seen</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                  {filteredProducts.map((stat) => {
                    const avgPricePaise =
                      stat.totalCount > 0 ? Math.round(stat.sumPricePaise / stat.totalCount) : stat.minPricePaise
                    const isHighlighted = justAddedKey === stat.productKey

                    return (
                      <tr
                        key={stat.productKey}
                        className={`hover:bg-gray-50/80 transition-colors ${
                          isHighlighted ? 'bg-indigo-50/50' : ''
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">{stat.displayName}</span>
                            {isHighlighted && (
                              <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-md font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Just Added
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-900 tabular-nums text-sm">
                          {formatRupees(avgPricePaise)}
                          {stat.minPricePaise !== stat.maxPricePaise && stat.maxPricePaise > 0 && (
                            <span className="block text-[10px] text-gray-400 font-normal">
                              ({formatRupees(stat.minPricePaise)} - {formatRupees(stat.maxPricePaise)})
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center text-gray-500 tabular-nums">
                          <span className="inline-block px-2 py-0.5 bg-gray-100 rounded-md text-[11px] font-semibold text-gray-600">
                            {Math.round(stat.totalCount)} pts ({stat.observationCount || 1} sales)
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-gray-400 tabular-nums text-[11px]">
                          {stat.lastSoldAt ? new Date(stat.lastSoldAt).toLocaleDateString('en-IN') : 'Manual'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(stat)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                            title="Delete suggestion"
                            aria-label={`Delete ${stat.displayName}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
