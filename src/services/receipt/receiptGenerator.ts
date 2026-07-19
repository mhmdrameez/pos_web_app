import type { CartItem, CompletedSale, Customer } from '../../types'
import { formatRupees } from '../../utils/money'

export interface ReceiptItem {
  name: string
  quantity: number
  lineTotal: string
}

export interface ReceiptData {
  businessName: string
  invoiceNumber: string
  date: string
  items: ReceiptItem[]
  subtotal: string
  discount: string
  hasDiscount: boolean
  grandTotal: string
  paymentMethod: string
  amountPaid?: string
  change?: string
  customer?: Customer | null
}

export function generateReceiptData(sale: CompletedSale, businessName: string): ReceiptData {
  const items = sale.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    lineTotal: formatRupees(item.unitPricePaise * item.quantity).replace('₹', 'Rs.'),
  }))

  const dateStr = new Date(sale.completedAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return {
    businessName,
    invoiceNumber: sale.invoiceNumber,
    date: dateStr,
    items,
    subtotal: formatRupees(sale.subtotalPaise).replace('₹', 'Rs.'),
    discount: formatRupees(sale.discountPaise || 0).replace('₹', 'Rs.'),
    hasDiscount: (sale.discountPaise || 0) > 0,
    grandTotal: formatRupees(sale.grandTotalPaise).replace('₹', 'Rs.'),
    paymentMethod: sale.paymentMethod.toUpperCase(),
    amountPaid: sale.amountPaidPaise ? formatRupees(sale.amountPaidPaise).replace('₹', 'Rs.') : undefined,
    change: sale.changePaise ? formatRupees(sale.changePaise).replace('₹', 'Rs.') : undefined,
    customer: sale.customer,
  }
}

export function generateReceiptText(data: ReceiptData, paperWidth: 58 | 80 = 58): string {
  const width = paperWidth === 80 ? 48 : 32
  const lines: string[] = []
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2))
    return ' '.repeat(pad) + text
  }
  const row = (left: string, right: string) => {
    const space = width - left.length - right.length
    return left + ' '.repeat(Math.max(1, space)) + right
  }

  lines.push(center(data.businessName))
  if (data.invoiceNumber !== 'PREVIEW') lines.push(center(data.invoiceNumber))
  lines.push(center(data.date))
  lines.push('')

  if (data.customer) {
    lines.push('Customer:')
    lines.push(data.customer.name)
    lines.push(data.customer.phone)
    if (data.customer.email) lines.push(data.customer.email)
    lines.push('')
  }

  lines.push('-'.repeat(width))
  for (const item of data.items) {
    lines.push(row(`${item.name} x${item.quantity}`, item.lineTotal))
  }
  lines.push('-'.repeat(width))
  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0)
  const totalQtyDisplay = Number.isInteger(totalQuantity)
    ? totalQuantity.toString()
    : totalQuantity.toFixed(2).replace(/\.?0+$/, '')
  lines.push(row('Total Qty', totalQtyDisplay))
  if (data.hasDiscount) {
    lines.push(row('Subtotal', data.subtotal))
    lines.push(row('Discount', `-${data.discount}`))
  }
  lines.push('='.repeat(width))
  lines.push(row('TOTAL', data.grandTotal))
  lines.push('='.repeat(width))
  lines.push('')
  lines.push(`Payment: ${data.paymentMethod}`)
  if (data.amountPaid) lines.push(`Paid: ${data.amountPaid}`)
  if (data.change) lines.push(`Change: ${data.change}`)
  lines.push('')
  lines.push(center('Thank you!'))

  return lines.join('\n')
}
