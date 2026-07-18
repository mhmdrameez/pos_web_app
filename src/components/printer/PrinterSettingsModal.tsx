import { useEffect, useState } from 'react'
import { Bluetooth, BluetoothOff, Printer } from 'lucide-react'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { useAppStore } from '../../stores/useAppStore'
import { printerService } from '../../services/printer/PrinterService'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function PrinterSettingsModal() {
  const isOpen = useAppStore((s) => s.isPrinterSettingsOpen)
  const closePrinterSettings = useAppStore((s) => s.closePrinterSettings)
  const addToast = useAppStore((s) => s.addToast)
  const businessName = useAppStore((s) => s.businessName)

  const paperWidth = usePrinterStore((s) => s.paperWidth)
  const deviceName = usePrinterStore((s) => s.deviceName)
  const status = usePrinterStore((s) => s.status)
  const lastError = usePrinterStore((s) => s.lastError)
  const isSupported = usePrinterStore((s) => s.isSupported)
  const setPaperWidth = usePrinterStore((s) => s.setPaperWidth)
  const setStatus = usePrinterStore((s) => s.setStatus)
  const setDevice = usePrinterStore((s) => s.setDevice)
  const setLastError = usePrinterStore((s) => s.setLastError)
  const disconnect = usePrinterStore((s) => s.disconnect)

  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    usePrinterStore.getState().setIsSupported(printerService.isSupported())
  }, [])

  async function handleConnect() {
    if (!isSupported) {
      addToast('error', 'Web Bluetooth is not supported. Use Chrome or Edge on Android/desktop.')
      return
    }

    setIsConnecting(true)
    setStatus('connecting')
    setLastError(null)

    try {
      const name = await printerService.connect()
      setDevice(printerService.getDeviceId() ?? undefined, name ?? 'BLE Printer')
      setStatus('connected')
      addToast('success', `Connected to ${name ?? 'printer'}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      setStatus('error')
      setLastError(message)
      addToast('error', message)
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await printerService.disconnect()
      disconnect()
      addToast('info', 'Printer disconnected')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Disconnect failed'
      addToast('error', message)
    }
  }

  async function handleTestPrint() {
    if (!printerService.isConnected()) {
      addToast('error', 'Connect a printer first')
      return
    }

    try {
      await printerService.printTestPage(businessName, paperWidth)
      addToast('success', 'Test print sent')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test print failed'
      addToast('error', message)
    }
  }

  const statusLabel = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error',
  }[status]

  return (
    <Modal open={isOpen} onClose={closePrinterSettings} title="Printer Settings" size="md">
      <div className="space-y-5">
        {!isSupported && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            Web Bluetooth is not available in this browser. Use Chrome or Edge on a supported
            device to connect BLE thermal printers.
          </div>
        )}

        <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-semibold text-gray-900">{statusLabel}</p>
            {deviceName && (
              <p className="text-sm text-gray-600 mt-1">
                {status === 'connected' ? 'Connected printer: ' : 'Saved printer: '}
                {deviceName}
              </p>
            )}
            {lastError && <p className="text-sm text-red-500 mt-1">{lastError}</p>}
          </div>
          {status === 'connected' ? (
            <Bluetooth className="w-8 h-8 text-primary" />
          ) : (
            <BluetoothOff className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Paper Width</p>
          <div className="grid grid-cols-2 gap-2">
            {([58, 80] as const).map((width) => (
              <button
                key={width}
                onClick={() => setPaperWidth(width)}
                className={`py-3 rounded-xl font-medium ${
                  paperWidth === width
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {width}mm
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {status !== 'connected' ? (
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={!isSupported || isConnecting}
              className="flex items-center justify-center gap-2"
            >
              <Bluetooth className="w-4 h-4" />
              {isConnecting ? 'Connecting...' : 'Connect Printer'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
          
          <Button
            variant="secondary"
            onClick={handleTestPrint}
            disabled={status !== 'connected'}
            className="flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Test Print
          </Button>
        </div>

        <p className="text-xs text-gray-500">
          Supports BLE thermal printers via Web Bluetooth. Bluetooth Classic (SPP) printers are not
          supported in web browsers.
        </p>
      </div>
    </Modal>
  )
}
