import type { CompletedSale } from '../../types'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { generateReceiptData, type ReceiptData } from '../receipt/receiptGenerator'
import { EscPosEncoder } from './EscPosEncoder'
import type { PrinterAdapter } from './PrinterAdapter'
import { WebBluetoothPrinter } from './WebBluetoothPrinter'

export class PrinterService {
  private adapter: PrinterAdapter
  private silentTimer: ReturnType<typeof setTimeout> | null = null
  private silentStopped = true
  private silentRunning = false
  private visibilityHandler: (() => void) | null = null

  constructor(adapter?: PrinterAdapter) {
    this.adapter = adapter ?? new WebBluetoothPrinter()
    if (this.adapter instanceof WebBluetoothPrinter) {
      this.adapter.setConnectionListener((connected) => {
        const store = usePrinterStore.getState()
        if (connected) {
          store.setStatus('connected')
          store.setLastError(null)
        } else if (store.status === 'connected') {
          store.setStatus('disconnected')
          if (!this.silentStopped) this.scheduleSilentRetry(1500)
        }
      })
    }
  }

  isSupported(): boolean {
    return this.adapter.isSupported()
  }

  async connect(): Promise<string | null> {
    await this.adapter.connect()
    this.startSilentAutoConnect()
    return this.adapter.getDeviceName()
  }

  async reconnect(deviceId: string): Promise<string | null> {
    const store = usePrinterStore.getState()
    const savedName =
      store.pairedPrinters?.find((printer) => printer.id === deviceId)?.name ?? store.deviceName
    await this.adapter.reconnect(deviceId, savedName)
    this.startSilentAutoConnect()
    return this.adapter.getDeviceName()
  }

  async listPairedPrinters(): Promise<{ id: string; name: string }[]> {
    return this.adapter.listPairedPrinters()
  }

  async disconnect(): Promise<void> {
    this.stopSilentAutoConnect()
    await this.adapter.disconnect()
  }

  // After the first browser pairing, later visits reconnect in the background.
  // Never calls requestDevice() — that picker cannot be driven by a page script.
  startSilentAutoConnect(): void {
    this.silentStopped = false
    this.bindSilentVisibility()
    void this.runSilentAutoConnect()
  }

  stopSilentAutoConnect(): void {
    this.silentStopped = true
    if (this.silentTimer !== null) {
      clearTimeout(this.silentTimer)
      this.silentTimer = null
    }
  }

  private bindSilentVisibility(): void {
    if (this.visibilityHandler || typeof document === 'undefined') return
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && !this.silentStopped) {
        void this.runSilentAutoConnect()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private scheduleSilentRetry(ms: number): void {
    if (this.silentStopped) return
    if (this.silentTimer !== null) clearTimeout(this.silentTimer)
    this.silentTimer = setTimeout(() => {
      this.silentTimer = null
      void this.runSilentAutoConnect()
    }, ms)
  }

  private async runSilentAutoConnect(): Promise<void> {
    if (this.silentStopped || this.silentRunning) return
    if (this.isConnected()) {
      this.scheduleSilentRetry(30_000)
      return
    }

    const store = usePrinterStore.getState()
    const deviceId = store.deviceId
    if (!deviceId) {
      this.scheduleSilentRetry(15_000)
      return
    }

    this.silentRunning = true
    try {
      const savedName =
        store.pairedPrinters?.find((printer) => printer.id === deviceId)?.name ?? store.deviceName
      await this.adapter.reconnect(deviceId, savedName)
      if (this.silentStopped) return
      store.rememberPrinter(
        deviceId,
        this.adapter.getDeviceName() ?? savedName ?? store.deviceName ?? 'BLE Printer',
      )
      store.setStatus('connected')
      store.setLastError(null)
      this.scheduleSilentRetry(30_000)
    } catch {
      this.scheduleSilentRetry(5000)
    } finally {
      this.silentRunning = false
    }
  }

  isConnected(): boolean {
    return this.adapter.isConnected()
  }

  getDeviceName(): string | null {
    return this.adapter.getDeviceName()
  }

  getDeviceId(): string | null {
    return this.adapter.getDeviceId()
  }

  async printReceipt(sale: CompletedSale, businessName: string, paperWidth: 58 | 80): Promise<void> {
  const receiptData = generateReceiptData(sale, businessName)
  const encoded = this.encodeReceipt(receiptData, paperWidth)
  await this.adapter.print(encoded)
  
  // Allow the printer to finish processing before the next job can start
  await new Promise(resolve => setTimeout(resolve, 500))
}

  async printTestPage(businessName: string, paperWidth: 58 | 80): Promise<void> {
    const encoder = new EscPosEncoder(paperWidth)
    const data = encoder
      .align('center')
      .bold(true)
      .text(businessName)
      .newline()
      .bold(false)
      .text('Test Print')
      .newline(2)
      .align('left')
      .text(`Paper: ${paperWidth}mm`)
      .newline()
      .text(new Date().toLocaleString('en-IN'))
      .newline(2)
      .align('center')
      .text('Printer OK')
      .newline()
      .cut()
      .encode()

    await this.adapter.print(data)
  }

  encodeReceipt(data: ReceiptData, paperWidth: 58 | 80): Uint8Array {
  const encoder = new EscPosEncoder(paperWidth)

  // Header
  encoder.align('center').bold(true).size(1, 2).text(data.businessName)
    .newline().bold(false).size()

  if (data.invoiceNumber !== 'PREVIEW') {
    encoder.align('center').text(data.invoiceNumber).newline()
  }
  encoder.text(data.date).newline(2)

  // Customer info
  if (data.customer) {
    encoder.align('left').bold(true).text('Customer').newline().bold(false)
    encoder.text(data.customer.name).newline()
    encoder.text(data.customer.phone).newline()
    if (data.customer.email) encoder.text(data.customer.email).newline()
    encoder.newline()
  }

  // Items
  encoder.separator()
  for (const item of data.items) {
    encoder.tableRow(item.name, item.lineTotal)
  }
  encoder.separator()

  // Totals
  const totalQuantity = data.items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0)
  encoder.tableRow('Total Qty', totalQuantity.toString())

  if (data.hasDiscount) {
    encoder.tableRow('Subtotal', data.subtotal)
    encoder.tableRow('Discount', `-${data.discount}`)
  }
  encoder.bold(true).tableRow('TOTAL', data.grandTotal).bold(false)
  encoder.feedLines(1)

  // Payment details
  encoder.text(`Payment: ${data.paymentMethod}`)
  if (data.amountPaid) encoder.newline().text(`Paid: ${data.amountPaid}`)
  if (data.change) encoder.newline().text(`Change: ${data.change}`)
  
  // Footer
  encoder.newline(1)
  encoder.align('center').text('Thank you!')

  // Feed just enough lines for the paper cutter to engage cleanly
  encoder.feedLines(1.2)
  encoder.cut()

  return encoder.encode()
}
}

export const printerService = new PrinterService()
