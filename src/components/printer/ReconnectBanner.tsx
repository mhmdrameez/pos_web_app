import { useState } from 'react'
import { Bluetooth, BluetoothOff, X } from 'lucide-react'
import { usePrinterStore } from '../../stores/usePrinterStore'
import { printerService } from '../../services/printer/PrinterService'

/**
 * ReconnectBanner
 *
 * Why this exists:
 *   Web Bluetooth's navigator.bluetooth.getDevices() REQUIRES a user gesture.
 *   It cannot be called automatically on page load — the browser blocks it.
 *   So after a page refresh the printer appears disconnected even though the
 *   OS/phone is still paired. This banner gives the user a single tap to
 *   reconnect using the saved deviceId (no Bluetooth picker shown).
 *
 * Shows only when:
 *   • A saved printer deviceId exists in the store (from a previous session)
 *   • The printer is currently not connected
 */
export function ReconnectBanner() {
  const deviceId = usePrinterStore((s) => s.deviceId)
  const deviceName = usePrinterStore((s) => s.deviceName)
  const status = usePrinterStore((s) => s.status)
  const setStatus = usePrinterStore((s) => s.setStatus)
  const setDevice = usePrinterStore((s) => s.setDevice)
  const setLastError = usePrinterStore((s) => s.setLastError)

  const [dismissed, setDismissed] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Only show when we have a saved printer but it's not connected
  const shouldShow =
    !dismissed &&
    !!deviceId &&
    status !== 'connected' &&
    status !== 'connecting'

  if (!shouldShow) return null

  async function handleReconnect() {
    if (!deviceId) return
    setConnecting(true)
    setStatus('connecting')
    setLastError(null)
    try {
      const name = await printerService.reconnect(deviceId)
      setDevice(deviceId, name ?? deviceName)
      setStatus('connected')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Reconnection failed'
      setStatus('error')
      setLastError(msg)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-sm shrink-0">
      {connecting ? (
        <Bluetooth className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
      ) : (
        <BluetoothOff className="w-4 h-4 text-amber-600 shrink-0" />
      )}
      <span className="flex-1 text-amber-800">
        {connecting
          ? `Connecting to ${deviceName ?? 'printer'}…`
          : `${deviceName ?? 'Printer'} not connected after refresh`}
      </span>
      {!connecting && (
        <>
          <button
            onClick={handleReconnect}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 active:bg-amber-800 transition-colors shrink-0"
          >
            Reconnect
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1 rounded text-amber-600 hover:bg-amber-100 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
