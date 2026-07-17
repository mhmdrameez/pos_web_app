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

// Acknowledged writes: BLE spec allows up to negotiated MTU (often 512 bytes).
// Without-response writes share a limited BLE notification buffer; keep them small
// so the printer's internal FIFO never overflows between prints.
const CHUNK_SIZE_WITH_RESPONSE = 512
const CHUNK_SIZE_WITHOUT_RESPONSE = 100
// Delay between without-response chunks (ms). Must be long enough for the
// printer's serial buffer to drain. 120 ms is safe for most 58/80 mm thermal printers.
const CHUNK_DELAY_MS = 120

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

      device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null
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

  async print(data: Uint8Array): Promise<void> {
    if (!this.characteristic || !this.isConnected()) {
      throw new PrinterConnectionError('Printer is not connected')
    }

    const props = this.characteristic.properties

    // Prefer acknowledged writes (writeValue) — they provide backpressure and
    // guarantee the chunk was received before we send the next one. This is
    // what fixes the "second print stops halfway" bug: without backpressure the
    // BLE output buffer fills up and later chunks are silently dropped.
    const useAcknowledged = Boolean(props.write)
    const chunkSize = useAcknowledged ? CHUNK_SIZE_WITH_RESPONSE : CHUNK_SIZE_WITHOUT_RESPONSE

    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize)

      if (useAcknowledged) {
        // writeValue waits for the GATT acknowledgment — built-in backpressure.
        await this.characteristic.writeValue(chunk)
      } else if (props.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk)
        // Without an acknowledgment we must wait long enough for the printer's
        // serial FIFO to drain before sending the next chunk. 50 ms was too
        // short on the second print when the BLE stack's buffer was not yet
        // fully flushed from the previous job.
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS))
      } else {
        throw new PrinterConnectionError('Characteristic does not support writing')
      }
    }
  }
}
