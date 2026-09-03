const GENERIC_LINE_NAME = /^\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?$/i
const GENERIC_ITEM_NAME = /^item\s+[a-z0-9]+$/i
const BRACKETED_LINE = /^(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\s*\((.+)\)\s*$/i

export function normalizeProductKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
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
  return productNameFromLine(name) == null
}

export function productNameFromLine(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  const bracketed = trimmed.match(BRACKETED_LINE)
  if (bracketed) {
    const inner = bracketed[2].trim()
    if (!inner || GENERIC_ITEM_NAME.test(inner) || GENERIC_LINE_NAME.test(inner)) return null
    return inner
  }

  if (GENERIC_LINE_NAME.test(trimmed) || GENERIC_ITEM_NAME.test(trimmed)) return null
  return trimmed
}

export function autoLineName(unitPricePaise: number, quantity: number): string {
  const rupees = unitPricePaise / 100
  const priceLabel = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2).replace(/\.?0+$/, '')
  const qtyLabel = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')
  return `${priceLabel} x ${qtyLabel}`
}

export function composeLineName(
  unitPricePaise: number,
  quantity: number,
  productName?: string | null,
): string {
  const line = autoLineName(unitPricePaise, quantity)
  const product = productNameFromLine(productName ?? '') ?? productName?.trim()
  if (!product || isGenericLineName(product)) return line
  return `${line} (${formatDisplayName(product)})`
}

export function splitLineDisplay(
  name: string,
  unitPricePaise: number,
  quantity: number,
): { lineLabel: string; productName: string | null } {
  return {
    lineLabel: autoLineName(unitPricePaise, quantity),
    productName: productNameFromLine(name),
  }
}

export function quantityKind(quantity: number): 'integer' | 'decimal' {
  return Number.isInteger(quantity) ? 'integer' : 'decimal'
}

export function pairId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
