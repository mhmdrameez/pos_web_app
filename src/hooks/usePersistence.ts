import { useEffect } from 'react'
import { initializeDatabase, getSettings, getCartSnapshot, saveCartSnapshot } from '../services/db/database'
import { getPrinterSettings, savePrinterSettings } from '../services/db/database'
import { useAppStore } from '../stores/useAppStore'
import { useCartStore } from '../stores/useCartStore'
import { usePrinterStore } from '../stores/usePrinterStore'

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
