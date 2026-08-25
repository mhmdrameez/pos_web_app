const GENERIC_LINE_NAME = /^\d+(?:\.\d+)?\s*[x×]\s*\d/i
const GENERIC_ITEM_NAME = /^item\s+[a-z0-9]+$/i

export function normalizeProductKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function formatDisplayName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function isGenericLineName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (GENERIC_LINE_NAME.test(trimmed)) return true
  if (GENERIC_ITEM_NAME.test(trimmed)) return true
  return false
}

export function autoLineName(unitPricePaise: number, quantity: number): string {
  const rupees = unitPricePaise / 100
  const priceLabel = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2).replace(/\.?0+$/, '')
  const qtyLabel = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')
  return `${priceLabel} x ${qtyLabel}`
}

export function quantityKind(quantity: number): 'integer' | 'decimal' {
  return Number.isInteger(quantity) ? 'integer' : 'decimal'
}

export function pairId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
