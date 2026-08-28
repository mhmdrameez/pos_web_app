import { create } from 'zustand'
import type { PairedPrinter, PrinterSettings } from '../types'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface PrinterState extends PrinterSettings {
  status: ConnectionStatus
  lastError: string | null
  isSupported: boolean

  setPaperWidth: (width: 58 | 80) => void
  setShowSuggestions: (show: boolean) => void
  setStatus: (status: ConnectionStatus) => void
  setLastError: (error: string | null) => void
  setDevice: (deviceId: string | undefined, deviceName: string | undefined) => void
  rememberPrinter: (deviceId: string, deviceName: string) => void
  setPairedPrinters: (printers: PairedPrinter[]) => void
  setIsSupported: (supported: boolean) => void
  loadSettings: (settings: PrinterSettings) => void
  getSettings: () => PrinterSettings
  disconnect: () => void
}

function upsertPrinter(list: PairedPrinter[] | undefined, deviceId: string, deviceName: string): PairedPrinter[] {
  const printers = list ?? []
  if (printers.some((printer) => printer.id === deviceId)) {
    return printers.map((printer) =>
      printer.id === deviceId ? { id: deviceId, name: deviceName } : printer,
    )
  }
  return [...printers, { id: deviceId, name: deviceName }]
}

function seedPairedPrinters(settings: PrinterSettings): PairedPrinter[] {
  const saved = settings.pairedPrinters ?? []
  if (settings.deviceId && !saved.some((printer) => printer.id === settings.deviceId)) {
    return [
      ...saved,
      { id: settings.deviceId, name: settings.deviceName ?? 'BLE Printer' },
    ]
  }
  return saved
}

export const usePrinterStore = create<PrinterState>((set, get) => ({
  paperWidth: 58,
  showSuggestions: true,
  deviceId: undefined,
  deviceName: undefined,
  pairedPrinters: [],
  status: 'disconnected',
  lastError: null,
  isSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,

  setPaperWidth: (width) => set({ paperWidth: width }),
  setShowSuggestions: (show) => set({ showSuggestions: show }),

  setStatus: (status) => set({ status }),

  setLastError: (error) => set({ lastError: error }),

  setDevice: (deviceId, deviceName) => set({ deviceId, deviceName }),

  rememberPrinter: (deviceId, deviceName) =>
    set((state) => ({
      deviceId,
      deviceName,
      pairedPrinters: upsertPrinter(state.pairedPrinters, deviceId, deviceName),
    })),

  setPairedPrinters: (printers) => set({ pairedPrinters: printers }),

  setIsSupported: (supported) => set({ isSupported: supported }),

  loadSettings: (settings) =>
    set({
      paperWidth: settings.paperWidth,
      showSuggestions: settings.showSuggestions !== false,
      deviceId: settings.deviceId,
      deviceName: settings.deviceName,
      pairedPrinters: seedPairedPrinters(settings),
    }),

  getSettings: () => {
    const { paperWidth, showSuggestions, deviceId, deviceName, pairedPrinters } = get()
    return { paperWidth, showSuggestions, deviceId, deviceName, pairedPrinters }
  },

  disconnect: () =>
    set({
      status: 'disconnected',
      lastError: null,
    }),
}))
