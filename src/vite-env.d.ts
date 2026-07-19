/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

declare const __APP_VERSION__: string

interface BluetoothDevice {
  readonly id: string
  readonly name?: string
  readonly gatt?: BluetoothRemoteGATTServer
  addEventListener(type: 'gattserverdisconnected', listener: EventListener): void
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>
}

interface BluetoothRemoteGATTCharacteristic {
  readonly properties: {
    read: boolean
    write: boolean
    writeWithoutResponse: boolean
  }
  writeValue(data: BufferSource): Promise<void>
  writeValueWithoutResponse(data: BufferSource): Promise<void>
}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean
  optionalServices?: string[]
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>
  getDevices?(): Promise<BluetoothDevice[]>
}

interface Navigator {
  bluetooth?: Bluetooth
}
