import { useEffect } from 'react'
import { initializeDatabase, getSettings, getCartSnapshot, saveCartSnapshot } from '../services/db/database'
import { getPrinterSettings, savePrinterSettings } from '../services/db/database'
import { printerService } from '../services/printer/PrinterService'
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

        // Show the UI immediately — don't block on suggestion index
        setDbReady(true)

        // Load suggestions in the background; engine returns empty results until ready
        try {
          const { ensureProductSuggestionIndex } = await import('../services/suggestion')
          await ensureProductSuggestionIndex()
        } catch {
          // Suggestions stay off until the next successful local index rebuild.
        }

        // Initialize Supabase cloud sync if configured
        try {
          const { initSupabaseFromSettings, syncAllPendingSales } = await import('../services/cloud/supabaseSync')
          await initSupabaseFromSettings()
          // Catch up on any unsynced sales right away
          void syncAllPendingSales()
        } catch {
          // Cloud sync stays off
        }

        // Add online event listener to retry cloud sync immediately when internet comes back
        const handleOnline = () => {
          import('../services/cloud/supabaseSync')
            .then(({ syncAllPendingSales, isCloudEnabled }) => {
              if (isCloudEnabled()) {
                void syncAllPendingSales()
              }
            })
            .catch(() => {})
        }
        window.addEventListener('online', handleOnline)

        if (printer.deviceId) {
          printerService.startSilentAutoConnect()
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
