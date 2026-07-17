import { useEffect } from 'react'
import { initializeDatabase, getSettings, getCartSnapshot, saveCartSnapshot } from '../services/db/database'
import { getPrinterSettings, savePrinterSettings } from '../services/db/database'
import { useAppStore } from '../stores/useAppStore'
import { useCartStore } from '../stores/useCartStore'
import { usePrinterStore } from '../stores/usePrinterStore'
import { printerService } from '../services/printer/PrinterService'

export function usePersistence() {
  const setDbReady = useAppStore((s) => s.setDbReady)
  const setBusinessName = useAppStore((s) => s.setBusinessName)
  const addToast = useAppStore((s) => s.addToast)
  const loadPrinterSettings = usePrinterStore((s) => s.loadSettings)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        await initializeDatabase()
        const settings = await getSettings()
        const cart = await getCartSnapshot()
        const printer = await getPrinterSettings()

        if (!mounted) return

        setBusinessName(settings.businessName)
        useCartStore.getState().loadCart({
          items: cart.items,
          customer: cart.customer,
          discountPaise: cart.discountPaise,
        })
        loadPrinterSettings(printer)
        setDbReady(true)

        // TRICK: Web Bluetooth getDevices() requires a user gesture.
        // We can't connect on page load, but we CAN connect on the very first 
        // interaction the user makes with the app (tap, click, etc).
        // We attach a one-time global listener that hijacks the first tap to reconnect.
        if (printer.deviceId && printerService.isSupported()) {
          usePrinterStore.getState().setStatus('disconnected')

          const handleFirstInteraction = async () => {
            // Remove listeners immediately so this only runs once
            window.removeEventListener('pointerdown', handleFirstInteraction)
            window.removeEventListener('keydown', handleFirstInteraction)

            // Only attempt if still disconnected
            const currentStatus = usePrinterStore.getState().status
            if (currentStatus === 'connected' || currentStatus === 'connecting') return

            usePrinterStore.getState().setStatus('connecting')
            try {
              const name = await printerService.reconnect(printer.deviceId!)
              usePrinterStore.getState().setDevice(printer.deviceId, name ?? printer.deviceName)
              usePrinterStore.getState().setStatus('connected')
              usePrinterStore.getState().setLastError(null)
              useAppStore.getState().addToast('success', `Printer auto-connected`)
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Auto-connect failed'
              usePrinterStore.getState().setStatus('error')
              usePrinterStore.getState().setLastError(message)
            }
          }

          // Listen for any tap, click, or keypress anywhere on the screen
          window.addEventListener('pointerdown', handleFirstInteraction, { once: true })
          window.addEventListener('keydown', handleFirstInteraction, { once: true })
        }
      } catch {
        addToast('error', 'Failed to initialize database')
      }
    }

    init()
    return () => {
      mounted = false
    }
  }, [setDbReady, setBusinessName, addToast, loadPrinterSettings])

  useEffect(() => {
    const isReady = useAppStore.getState().isDbReady
    if (!isReady) return

    const unsubscribe = useCartStore.subscribe((state) => {
      const snapshot = state.getSnapshot()
      saveCartSnapshot(snapshot).catch(() => {
        useAppStore.getState().addToast('error', 'Failed to save cart')
      })
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = usePrinterStore.subscribe((state) => {
      if (!useAppStore.getState().isDbReady) return
      savePrinterSettings(state.getSettings()).catch(() => {
        useAppStore.getState().addToast('error', 'Failed to save printer settings')
      })
    })

    return unsubscribe
  }, [])
}
