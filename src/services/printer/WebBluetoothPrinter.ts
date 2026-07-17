import {
  PrinterConnectionError,
  PrinterNotSupportedError,
} from './PrinterAdapter'
import type { PrinterAdapter } from './PrinterAdapter'

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
]

const WRITE_CHARACTERISTIC_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
]

// ─── Chunk / timing constants ────────────────────────────────────────────────
//
// Cheap BLE thermal printers often only negotiate the default BLE MTU of
// 23 bytes (20 bytes of actual payload). Sending larger chunks causes the
// BLE stack to silently fragment or drop bytes, which is why the receipt
// stops halfway on the 2nd+ print.
//
// Safe defaults that work on ALL 58/80 mm BLE thermal printers:
//   • 20 bytes per chunk  — guaranteed to fit inside a single BLE packet
//   • 20 ms delay per chunk for writeWithoutResponse — gives the printer's
//     internal 256-byte serial FIFO time to drain
//   • Up to 3 retries per chunk with exponential back-off on NetworkError
//
const CHUNK_SIZE = 20           // bytes — fits every BLE MTU incl. the default 23-byte MTU
const INTER_CHUNK_DELAY_MS = 20 // ms — safe drain time for the printer's serial FIFO
const MAX_RETRIES = 3           // retries per chunk before giving up
// ─────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class WebBluetoothPrinter implements PrinterAdapter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new PrinterNotSupportedError()
    }

    try {
      const bluetooth = navigator.bluetooth
      if (!bluetooth) {
        throw new PrinterNotSupportedError()
      }

      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICE_UUIDS,
      })

      await this.connectToDevice(device)
    } catch (error) {
      this.throwConnectionError(error)
    }
  }

  async reconnect(deviceId: string): Promise<void> {
    if (!this.isSupported()) {
      throw new PrinterNotSupportedError()
    }

    try {
      const bluetooth = navigator.bluetooth
      if (!bluetooth?.getDevices) {
        throw new PrinterConnectionError('Automatic reconnection is not supported by this browser')
      }

      const device = (await bluetooth.getDevices()).find((savedDevice) => savedDevice.id === deviceId)
      if (!device) {
        throw new PrinterConnectionError('Saved printer permission is no longer available')
      }

      await this.connectToDevice(device)
    } catch (error) {
      this.throwConnectionError(error)
    }
  }

  private async connectToDevice(device: BluetoothDevice): Promise<void> {
      if (!device.gatt) {
        throw new PrinterConnectionError('Bluetooth GATT not available on device')
      }

      const server = await device.gatt.connect()
      let characteristic: BluetoothRemoteGATTCharacteristic | null = null

      for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
        try {
          const service = await server.getPrimaryService(serviceUuid)
          for (const charUuid of WRITE_CHARACTERISTIC_UUIDS) {
            try {
              characteristic = await service.getCharacteristic(charUuid)
              break
            } catch {
              // try next characteristic
            }
          }
          if (characteristic) break
        } catch {
          // try next service
        }
      }

      if (!characteristic) {
        const services = await server.getPrimaryServices()
        for (const service of services) {
          const characteristics = await service.getCharacteristics()
          const writable = characteristics.find(
            (c) => c.properties.write || c.properties.writeWithoutResponse,
          )
          if (writable) {
            characteristic = writable
            break
          }
        }
      }

      if (!characteristic) {
        throw new PrinterConnectionError(
          'No writable characteristic found on printer. Ensure your BLE thermal printer is supported.',
        )
      }

      this.device = device
      this.characteristic = characteristic

      // Clear BOTH references on disconnect so isConnected() never lies
      device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null
        this.device = null
      })
  }

  private throwConnectionError(error: unknown): never {
      if (error instanceof PrinterConnectionError || error instanceof PrinterNotSupportedError) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Failed to connect to printer'
      if (message.includes('cancelled') || message.includes('canceled')) {
        throw new PrinterConnectionError('Printer pairing was cancelled')
      }
      throw new PrinterConnectionError(message)
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.device = null
    this.characteristic = null
  }

  isConnected(): boolean {
    return Boolean(this.device?.gatt?.connected && this.characteristic)
  }

  getDeviceName(): string | null {
    return this.device?.name ?? null
  }

  getDeviceId(): string | null {
    return this.device?.id ?? null
  }

  // ─── Core print method ──────────────────────────────────────────────────────
  //
  // Why it stopped after half the receipt on the 2nd+ print:
  //
  //  1. Chunk size was too large (100–512 bytes). Cheap printers negotiate only
  //     the default BLE MTU of 23 bytes. Oversized chunks are silently dropped
  //     by the BLE stack on the 2nd print once the internal queue is backed up.
  //
  //  2. writeValueWithoutResponse() throws NetworkError when the browser's BLE
  //     write queue is full. We never caught that error, so the loop crashed
  //     silently mid-receipt leaving the paper half-printed.
  //
  //  3. No retry logic — a single transient BLE error killed the whole job.
  //
  // Fix:
  //  • 20-byte chunks → always fits inside one BLE packet regardless of MTU
  //  • Per-chunk retry with exponential back-off on NetworkError
  //  • 20 ms delay after every writeWithoutResponse → drains the printer FIFO
  //  • writeValueWithResponse preferred when available (gives GATT backpressure)
  // ───────────────────────────────────────────────────────────────────────────
  async print(data: Uint8Array): Promise<void> {
    if (!this.characteristic || !this.isConnected()) {
      throw new PrinterConnectionError('Printer is not connected')
    }

    const char = this.characteristic
    const props = char.properties
    const canWrite = Boolean(props.write)
    const canWriteWR = Boolean(props.writeWithoutResponse)

    if (!canWrite && !canWriteWR) {
      throw new PrinterConnectionError('Characteristic does not support writing')
    }

    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE)

      // Retry loop — recovers from transient BLE queue-full (NetworkError) errors
      let lastError: unknown
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (canWrite) {
            // writeValueWithResponse waits for GATT ACK → natural backpressure,
            // no delay needed, works even on 2nd+ print.
            await char.writeValueWithResponse(chunk)
          } else {
            // writeWithoutResponse: browser queues internally; when queue is full
            // it throws NetworkError. We catch, back off, and retry.
            await char.writeValueWithoutResponse(chunk)
            // Give the printer's serial FIFO time to drain before next chunk.
            await delay(INTER_CHUNK_DELAY_MS)
          }
          lastError = null
          break // chunk sent OK
        } catch (err) {
          lastError = err
          const msg = err instanceof Error ? err.message : String(err)
          // Only retry on queue-full / network errors, not hard failures
          if (!msg.toLowerCase().includes('network') && !msg.toLowerCase().includes('busy')) {
            throw new PrinterConnectionError(`Write failed: ${msg}`)
          }
          // Exponential back-off: 50ms, 100ms, 200ms …
          await delay(50 * Math.pow(2, attempt))
        }
      }

      if (lastError) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError)
        throw new PrinterConnectionError(`Print failed after ${MAX_RETRIES} retries: ${msg}`)
      }
    }
  }
}
