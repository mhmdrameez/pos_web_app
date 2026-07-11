import type { CompletedSale } from '../../types'
import { generateReceiptData, type ReceiptData } from '../receipt/receiptGenerator'
import { EscPosEncoder } from './EscPosEncoder'
import type { PrinterAdapter } from './PrinterAdapter'
import { WebBluetoothPrinter } from './WebBluetoothPrinter'

export class PrinterService {
  private adapter: PrinterAdapter

  constructor(adapter?: PrinterAdapter) {
    this.adapter = adapter ?? new WebBluetoothPrinter()
  }

  isSupported(): boolean {
    return this.adapter.isSupported()
  }

  async connect(): Promise<string | null> {
    await this.adapter.connect()
    return this.adapter.getDeviceName()
  }

  async reconnect(deviceId: string): Promise<string | null> {
    await this.adapter.reconnect(deviceId)
    return this.adapter.getDeviceName()
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect()
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

    encoder.align('center').bold(true).size(1, 2).text(data.businessName).newline().bold(false).size()

    if (data.invoiceNumber !== 'PREVIEW') encoder.align('center').text(data.invoiceNumber).newline()
    encoder.text(data.date).newline(2)

    if (data.customer) {
      encoder.align('left').bold(true).text('Customer').newline().bold(false)
      encoder.text(data.customer.name).newline()
      encoder.text(data.customer.phone).newline()
      if (data.customer.email) encoder.text(data.customer.email).newline()
      encoder.newline()
    }

    encoder.separator()
    for (const item of data.items) {
      encoder.tableRow(item.name, item.lineTotal)
    }
    encoder.separator()

    if (data.hasDiscount) {
      encoder.tableRow('Discount', `-${data.discount}`)
    }
    encoder.bold(true).tableRow('TOTAL', data.grandTotal).bold(false)
    // ESC d 1 explicitly prints and feeds one blank line before payment details.
    encoder.feedLines(1)

    encoder.text(`Payment: ${data.paymentMethod}`)
    if (data.amountPaid) encoder.newline().text(`Paid: ${data.amountPaid}`)
    if (data.change) encoder.newline().text(`Change: ${data.change}`)

   

     const tearOffLines = 4;
  encoder.newline().align('center').text('Thank you!').newline(tearOffLines).cut()

    return encoder.encode()
  }
}

export const printerService = new PrinterService()
