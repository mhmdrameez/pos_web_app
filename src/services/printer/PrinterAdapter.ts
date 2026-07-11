export interface PrinterAdapter {
  isSupported(): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getDeviceName(): string | null
  print(data: Uint8Array): Promise<void>
}

export class PrinterNotSupportedError extends Error {
  constructor(message = 'Web Bluetooth is not supported in this browser') {
    super(message)
    this.name = 'PrinterNotSupportedError'
  }
}

export class PrinterConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrinterConnectionError'
  }
}
