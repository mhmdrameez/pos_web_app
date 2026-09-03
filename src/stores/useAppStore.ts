import { create } from 'zustand'
import type { BottomTab, SidebarView, ToastMessage } from '../types'
import { generateId } from '../utils/id'

// ── Persistent UI prefs (survive page reload) ────────────────────────────────
const PREFS_KEY = 'quick-sale-pos:ui-prefs'
function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const obj = JSON.parse(raw) as Record<string, unknown>
    return key in obj ? (obj[key] as T) : fallback
  } catch { return fallback }
}
function savePref(key: string, value: unknown) {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    const obj: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    obj[key] = value
    localStorage.setItem(PREFS_KEY, JSON.stringify(obj))
  } catch { /* ignore */ }
}

interface AppState {
  activeSidebarView: SidebarView
  activeBottomTab: BottomTab
  isCustomerModalOpen: boolean
  isCheckoutModalOpen: boolean
  isPrinterSettingsOpen: boolean
  isAppSettingsOpen: boolean
  isCartDrawerOpen: boolean
  confirmDialog: {
    open: boolean
    title: string
    message: string
    onConfirm: (() => void) | null
  }
  toasts: ToastMessage[]
  isDbReady: boolean
  businessName: string
  showNetworkLED: boolean
  forceOffline: boolean

  setActiveSidebarView: (view: SidebarView) => void
  setActiveBottomTab: (tab: BottomTab) => void
  openCustomerModal: () => void
  closeCustomerModal: () => void
  openCheckoutModal: () => void
  closeCheckoutModal: () => void
  openPrinterSettings: () => void
  closePrinterSettings: () => void
  openAppSettings: () => void
  closeAppSettings: () => void
  toggleCartDrawer: () => void
  setCartDrawerOpen: (open: boolean) => void
  showConfirm: (title: string, message: string, onConfirm: () => void) => void
  hideConfirm: () => void
  addToast: (type: ToastMessage['type'], message: string) => void
  removeToast: (id: string) => void
  setDbReady: (ready: boolean) => void
  setBusinessName: (name: string) => void
  setShowNetworkLED: (show: boolean) => void
  setForceOffline: (offline: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSidebarView: 'quick-sale',
  activeBottomTab: 'quick-sale',
  isCustomerModalOpen: false,
  isCheckoutModalOpen: false,
  isPrinterSettingsOpen: false,
  isAppSettingsOpen: false,
  isCartDrawerOpen: false,
  confirmDialog: {
    open: false,
    title: '',
    message: '',
    onConfirm: null,
  },
  toasts: [],
  isDbReady: false,
  businessName: 'My Business',
  showNetworkLED: loadPref('showNetworkLED', true),
  forceOffline: loadPref('forceOffline', false),

  setActiveSidebarView: (view) => {
    set({
      activeSidebarView: view,
      ...(view === 'quick-sale' ? { isPrinterSettingsOpen: false, activeBottomTab: 'quick-sale' as const } : {}),
      ...(view === 'saved-orders' ? { activeBottomTab: 'saved-orders' as const } : {}),
    })
  },

  setActiveBottomTab: (tab) => {
    set({ activeBottomTab: tab })
    if (tab === 'quick-sale') set({ activeSidebarView: 'quick-sale' })
    if (tab === 'saved-orders') set({ activeSidebarView: 'saved-orders' })
  },

  openCustomerModal: () => set({ isCustomerModalOpen: true }),
  closeCustomerModal: () => set({ isCustomerModalOpen: false }),
  openCheckoutModal: () => set({ isCheckoutModalOpen: true }),
  closeCheckoutModal: () => set({ isCheckoutModalOpen: false }),
  openPrinterSettings: () => set({ isPrinterSettingsOpen: true }),
  closePrinterSettings: () => set({ isPrinterSettingsOpen: false }),
  openAppSettings: () => set({ isAppSettingsOpen: true, activeSidebarView: 'app-settings' }),
  closeAppSettings: () => set({ isAppSettingsOpen: false }),

  toggleCartDrawer: () => set({ isCartDrawerOpen: !get().isCartDrawerOpen }),
  setCartDrawerOpen: (open) => set({ isCartDrawerOpen: open }),

  showConfirm: (title, message, onConfirm) =>
    set({ confirmDialog: { open: true, title, message, onConfirm } }),

  hideConfirm: () =>
    set({ confirmDialog: { open: false, title: '', message: '', onConfirm: null } }),

  addToast: (type, message) => {
    const id = generateId()
    set({ toasts: [...get().toasts, { id, type, message }] })
    setTimeout(() => get().removeToast(id), 4000)
  },

  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setDbReady: (ready) => set({ isDbReady: ready }),
  setBusinessName: (name) => set({ businessName: name }),

  setShowNetworkLED: (show) => {
    savePref('showNetworkLED', show)
    set({ showNetworkLED: show })
  },

  setForceOffline: (offline) => {
    savePref('forceOffline', offline)
    set({ forceOffline: offline })
  },
}))
