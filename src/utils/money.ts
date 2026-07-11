export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatRupeesFromString(amount: string): string {
  if (!amount || amount === '.') return '₹0.00'
  const num = parseFloat(amount)
  if (Number.isNaN(num)) return '₹0.00'
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: amount.includes('.') ? Math.min(2, amount.split('.')[1]?.length ?? 0) : 0,
    maximumFractionDigits: 2,
  })}`
}

export function parseAmountInput(current: string, input: string): string {
  if (input === '00') {
    if (!current || current === '0') return '0'
    if (current.includes('.')) return current
    return current + '00'
  }

  if (input === '.') {
    if (current.includes('.')) return current
    return current ? current + '.' : '0.'
  }

  const digit = input.replace(/\D/g, '')
  if (!digit) return current

  if (current === '0' && !current.includes('.')) {
    return digit
  }

  const next = current + digit
  const parts = next.split('.')
  if (parts.length === 2 && parts[1].length > 2) return current
  return next
}

export function amountStringToPaise(amount: string): number {
  const num = parseFloat(amount)
  if (Number.isNaN(num) || num < 0) return 0
  return Math.round(num * 100)
}

export function calculateLineTotal(unitPricePaise: number, quantity: number): number {
  return unitPricePaise * quantity
}

export function calculateSubtotal(items: { unitPricePaise: number; quantity: number }[]): number {
  return items.reduce((sum, item) => sum + calculateLineTotal(item.unitPricePaise, item.quantity), 0)
}

export function calculateTax(subtotalPaise: number, taxRatePercent: number): number {
  return Math.round((subtotalPaise * taxRatePercent) / 100)
}

export function calculateGrandTotal(
  subtotalPaise: number,
  taxPaise: number,
  discountPaise: number,
): number {
  return Math.max(0, subtotalPaise + taxPaise - discountPaise)
}

export function calculateChange(amountPaidPaise: number, grandTotalPaise: number): number {
  return Math.max(0, amountPaidPaise - grandTotalPaise)
}
