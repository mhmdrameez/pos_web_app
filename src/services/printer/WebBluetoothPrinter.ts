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
const WRITE_TIMEOUT_MS = 8000   // hanging GATT writes are how "connected but dead" shows up
const KEEPALIVE_INTERVAL_MS = 30_000
const MAX_AUTO_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY_MS = 1500
// ─────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new PrinterConnectionError(message)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    void promise.catch(() => undefined)
  }
}

function isTransientWriteError(message: string): boolean {
  const msg = message.toLowerCase()
  return msg.includes('network') || msg.includes('busy')
}

function isDeadConnectionError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    msg.includes('timed out') ||
    msg.includes('gatt') ||
    msg.includes('disconnect') ||
    msg.includes('not connected') ||
    msg.includes('no longer') ||
    msg.includes('unavailable') ||
    msg.includes('failed to execute')
  )
}

const pairedDeviceCache = new Map<string, BluetoothDevice>()

function rememberPairedDevice(device: BluetoothDevice): void {
  pairedDeviceCache.set(device.id, device)
}

async function getPermittedBluetoothDevices(): Promise<BluetoothDevice[]> {
  const bluetooth = navigator.bluetooth
  if (!bluetooth) return [...pairedDeviceCache.values()]

  const getDevices = bluetooth.getDevices
  if (typeof getDevices === 'function') {
    try {
      const devices = await getDevices.call(bluetooth)
      for (const device of devices) rememberPairedDevice(device)
      return devices
    } catch {
      // Some browsers expose getDevices but throw; use the in-memory cache instead.
    }
  }

  return [...pairedDeviceCache.values()]
}

export class WebBluetoothPrinter implements PrinterAdapter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private userDisconnected = false
  private reconnecting = false
  private suppressDisconnectHandling = false
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private visibilityListener: (() => void) | null = null
  private disconnectListener: EventListener | null = null
  private onConnectionChange: ((connected: boolean) => void) | null = null
  private writeChain: Promise<void> = Promise.resolve()

  setConnectionListener(listener: ((connected: boolean) => void) | null): void {
    this.onConnectionChange = listener
  }

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

      this.userDisconnected = false
      await this.connectToDevice(device)
    } catch (error) {
      this.throwConnectionError(error)
    }
  }

  async reconnect(deviceId: string, deviceName?: string): Promise<void> {
    if (!this.isSupported()) {
      throw new PrinterNotSupportedError()
    }

    try {
      const device = await this.resolvePairedDevice(deviceId, deviceName)
      this.userDisconnected = false
      await this.connectToDevice(device)
    } catch (error) {
      this.throwConnectionError(error)
    }
  }

  private async resolvePairedDevice(deviceId: string, deviceName?: string): Promise<BluetoothDevice> {
    const cached = this.device?.id === deviceId ? this.device : pairedDeviceCache.get(deviceId)
    if (cached?.gatt) return cached

    const permitted = await getPermittedBluetoothDevices()
    const fromPermission = permitted.find((savedDevice) => savedDevice.id === deviceId)
    if (fromPermission?.gatt) return fromPermission

    const bluetooth = navigator.bluetooth
    const canUseChooser = Boolean(navigator.userActivation?.isActive) && Boolean(bluetooth)
    if (canUseChooser && deviceName && deviceName !== 'BLE Printer') {
      const picked = await bluetooth!.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: PRINTER_SERVICE_UUIDS,
      })
      rememberPairedDevice(picked)
      return picked
    }

    if (cached) return cached
    throw new PrinterConnectionError(
      'Printer not found. Pair it once with Connect Printer, then reconnect from the list.',
    )
  }

  async listPairedPrinters(): Promise<{ id: string; name: string }[]> {
    const devices = await getPermittedBluetoothDevices()
    const byId = new Map<string, { id: string; name: string }>()
    for (const device of devices) {
      byId.set(device.id, {
        id: device.id,
        name: device.name?.trim() || 'BLE Printer',
      })
    }
    return [...byId.values()]
  }

  private async connectToDevice(device: BluetoothDevice): Promise<void> {
      if (!device.gatt) {
        throw new PrinterConnectionError('Bluetooth GATT not available on device')
      }

      this.unbindDisconnect(this.device)

      const server = await withTimeout(
        device.gatt.connect(),
        WRITE_TIMEOUT_MS,
        'Printer connection timed out',
      )
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
      rememberPairedDevice(device)
      this.bindDisconnect(device)
      this.startKeepAlive()
      this.bindVisibilityResume()
      this.notifyConnection(true)
  }

  private bindDisconnect(device: BluetoothDevice): void {
    this.unbindDisconnect(device)
    this.disconnectListener = () => {
      this.characteristic = null
      this.stopKeepAlive()
      if (this.suppressDisconnectHandling) return
      this.notifyConnection(false)
      if (!this.userDisconnected) {
        void this.autoReconnect()
      }
    }
    device.addEventListener('gattserverdisconnected', this.disconnectListener)
  }

  private unbindDisconnect(device: BluetoothDevice | null): void {
    if (device && this.disconnectListener) {
      device.removeEventListener('gattserverdisconnected', this.disconnectListener)
    }
    this.disconnectListener = null
  }

  private bindVisibilityResume(): void {
    if (this.visibilityListener || typeof document === 'undefined') return
    this.visibilityListener = () => {
      if (document.visibilityState === 'visible' && !this.userDisconnected && this.device) {
        void this.ensureLiveConnection().catch(() => {
          // keep-alive / next print will retry
        })
      }
    }
    document.addEventListener('visibilitychange', this.visibilityListener)
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAliveTimer = setInterval(() => {
      void this.ping().catch(() => {
        void this.recoverConnection()
      })
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private notifyConnection(connected: boolean): void {
    this.onConnectionChange?.(connected)
  }

  private async ping(): Promise<void> {
    if (!this.isConnected() || this.userDisconnected) return
    // NUL is ignored by ESC/POS printers; success means the GATT link is still live.
    await this.withWriteLock(async () => {
      if (!this.isConnected()) return
      await this.writeAll(new Uint8Array([0x00]))
    })
  }

  private async autoReconnect(): Promise<void> {
    if (this.userDisconnected || this.reconnecting || !this.device) return
    this.reconnecting = true
    try {
      for (let attempt = 0; attempt < MAX_AUTO_RECONNECT_ATTEMPTS; attempt++) {
        if (this.userDisconnected || !this.device) return
        await delay(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt))
        try {
          await this.connectToDevice(this.device)
          return
        } catch {
          // try again
        }
      }
    } finally {
      this.reconnecting = false
    }
  }

  private async recoverConnection(): Promise<void> {
    if (this.userDisconnected || !this.device?.gatt) {
      throw new PrinterConnectionError('Printer is not connected')
    }

    this.suppressDisconnectHandling = true
    try {
      if (this.device.gatt.connected) {
        this.device.gatt.disconnect()
      }
    } catch {
      // already down
    }

    this.characteristic = null
    await delay(400)
    try {
      await this.connectToDevice(this.device)
    } finally {
      this.suppressDisconnectHandling = false
    }
  }

  private async ensureLiveConnection(): Promise<void> {
    if (this.userDisconnected) {
      throw new PrinterConnectionError('Printer is not connected')
    }

    if (this.isConnected()) return

    if (this.device) {
      await this.recoverConnection()
      return
    }

    throw new PrinterConnectionError('Printer is not connected')
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.writeChain
    let release: () => void = () => {}
    this.writeChain = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous.catch(() => undefined)
    try {
      return await fn()
    } finally {
      release()
    }
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
    this.userDisconnected = true
    this.stopKeepAlive()
    this.unbindDisconnect(this.device)
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    if (this.device) rememberPairedDevice(this.device)
    this.characteristic = null
    this.notifyConnection(false)
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
    await this.withWriteLock(async () => {
      await this.ensureLiveConnection()
      try {
        await this.writeAll(data)
      } catch (error) {
        if (!isDeadConnectionError(error) || this.userDisconnected) {
          throw error
        }
        await this.recoverConnection()
        await this.writeAll(data)
      }
    })
  }

  private async writeAll(data: Uint8Array): Promise<void> {
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
            // writeValue is the acknowledged (write-with-response) call in the
            // Web Bluetooth TS types — it waits for the GATT ACK before returning.
            await withTimeout(
              char.writeValue(chunk),
              WRITE_TIMEOUT_MS,
              'Printer write timed out',
            )
          } else {
            // writeWithoutResponse: browser queues internally; when queue is full
            // it throws NetworkError. We catch, back off, and retry.
            await withTimeout(
              char.writeValueWithoutResponse(chunk),
              WRITE_TIMEOUT_MS,
              'Printer write timed out',
            )
            // Give the printer's serial FIFO time to drain before next chunk.
            await delay(INTER_CHUNK_DELAY_MS)
          }
          lastError = null
          break // chunk sent OK
        } catch (err) {
          lastError = err
          const msg = err instanceof Error ? err.message : String(err)
          if (isDeadConnectionError(err) && !isTransientWriteError(msg)) {
            throw err instanceof PrinterConnectionError
              ? err
              : new PrinterConnectionError(`Write failed: ${msg}`)
          }
          // Only retry on queue-full / network errors, not hard failures
          if (!isTransientWriteError(msg)) {
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
