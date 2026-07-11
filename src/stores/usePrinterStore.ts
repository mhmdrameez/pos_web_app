import { create } from 'zustand'
import type { PrinterSettings } from '../types'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface PrinterState extends PrinterSettings {
  status: ConnectionStatus
  lastError: string | null
  isSupported: boolean

  setPaperWidth: (width: 58 | 80) => void
  setStatus: (status: ConnectionStatus) => void
  setLastError: (error: string | null) => void
  setDevice: (deviceId: string | undefined, deviceName: string | undefined) => void
  setIsSupported: (supported: boolean) => void
  loadSettings: (settings: PrinterSettings) => void
  getSettings: () => PrinterSettings
  disconnect: () => void
}

export const usePrinterStore = create<PrinterState>((set, get) => ({
  paperWidth: 58,
  deviceId: undefined,
  deviceName: undefined,
  status: 'disconnected',
  lastError: null,
  isSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,

  setPaperWidth: (width) => set({ paperWidth: width }),

  setStatus: (status) => set({ status }),

  setLastError: (error) => set({ lastError: error }),

  setDevice: (deviceId, deviceName) => set({ deviceId, deviceName }),

  setIsSupported: (supported) => set({ isSupported: supported }),

  loadSettings: (settings) =>
    set({
      paperWidth: settings.paperWidth,
      deviceId: settings.deviceId,
      deviceName: settings.deviceName,
    }),

  getSettings: () => {
    const { paperWidth, deviceId, deviceName } = get()
    return { paperWidth, deviceId, deviceName }
  },

  disconnect: () =>
    set({
      status: 'disconnected',
      deviceId: undefined,
      deviceName: undefined,
      lastError: null,
    }),
}))
