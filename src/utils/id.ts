export function generateOrderNumber(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `ORD-${date}-${time}-${random}`
}

export function formatInvoiceNumber(sequence: number): string {
  return `INV-${sequence.toString().padStart(6, '0')}`
}

export function generateId(): string {
  return crypto.randomUUID()
}
