import type { CompletedSale } from '../../types'
function formatReceiptAmount(paise: number): string {
  return `Rs.${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export interface ReceiptData {
  businessName: string
  invoiceNumber: string
  date: string
  customer?: {
    name: string
    phone: string
    email?: string
  }
  items: {
    name: string
    quantity: number
    unitPrice: string
    lineTotal: string
  }[]
  subtotal: string
  tax: string
  discount: string
  hasDiscount: boolean
  grandTotal: string
  paymentMethod: string
  amountPaid?: string
  change?: string
}

export function generateReceiptData(
  sale: CompletedSale,
  businessName: string,
): ReceiptData {
  const paymentLabels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
  }

  return {
    businessName,
    invoiceNumber: sale.invoiceNumber,
    date: new Date(sale.completedAt).toLocaleString('en-IN'),
    customer: sale.customer
      ? {
          name: sale.customer.name,
          phone: sale.customer.phone,
          email: sale.customer.email,
        }
      : undefined,
    items: sale.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: formatReceiptAmount(item.unitPricePaise),
      lineTotal: formatReceiptAmount(item.unitPricePaise * item.quantity),
    })),
    subtotal: formatReceiptAmount(sale.subtotalPaise),
    tax: formatReceiptAmount(sale.taxPaise),
    discount: formatReceiptAmount(sale.discountPaise),
    hasDiscount: sale.discountPaise > 0,
    grandTotal: formatReceiptAmount(sale.grandTotalPaise),
    paymentMethod: paymentLabels[sale.paymentMethod] ?? sale.paymentMethod,
    amountPaid: sale.amountPaidPaise ? formatReceiptAmount(sale.amountPaidPaise) : undefined,
    change: sale.changePaise ? formatReceiptAmount(sale.changePaise) : undefined,
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
  lines.push(center(data.invoiceNumber))
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
    lines.push(item.name)
    lines.push(row(`${item.unitPrice} * ${item.quantity}`, item.lineTotal))
  }
  lines.push('-'.repeat(width))
  lines.push(row('Subtotal', data.subtotal))
  lines.push(row('Tax', data.tax))
  if (data.hasDiscount) lines.push(row('Discount', `-${data.discount}`))
  lines.push(row('TOTAL', data.grandTotal))
  lines.push('')
  lines.push(`Payment: ${data.paymentMethod}`)
  if (data.amountPaid) lines.push(`Paid: ${data.amountPaid}`)
  if (data.change) lines.push(`Change: ${data.change}`)
  lines.push('')
  lines.push(center('Thank you!'))

  return lines.join('\n')
}
