import { useAppStore } from '../../stores/useAppStore'
import { Sidebar } from '../ui/Sidebar'
import { BottomNav } from '../ui/BottomNav'
import { QuickSaleView } from '../quick-sale/QuickSaleView'
import { SavedOrdersView } from '../saved-orders/SavedOrdersView'
import { SalesHistoryView } from '../sales-history/SalesHistoryView'
import { ComingSoonView } from '../ui/ComingSoonView'
import { CustomerModal } from '../quick-sale/CustomerModal'
import { CheckoutModal } from '../quick-sale/CheckoutModal'
import { PrinterSettingsModal } from '../printer/PrinterSettingsModal'
import { AppSettingsModal } from '../settings/AppSettingsModal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ToastContainer } from '../ui/Toast'

export function AppLayout() {
  const activeSidebarView = useAppStore((s) => s.activeSidebarView)
  const activeBottomTab = useAppStore((s) => s.activeBottomTab)
  const isDbReady = useAppStore((s) => s.isDbReady)

  function renderContent() {
    if (activeBottomTab === 'sale') {
      return <ComingSoonView title="Sale" />
    }

    switch (activeSidebarView) {
      case 'quick-sale':
        return <QuickSaleView />
      case 'saved-orders':
        return <SavedOrdersView />
      case 'sales-history':
        return <SalesHistoryView />
      case 'printer-settings':
      case 'app-settings':
        return activeBottomTab === 'quick-sale' ? <QuickSaleView /> : <SavedOrdersView />
      default:
        return <QuickSaleView />
    }
  }

  if (!isDbReady) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-full flex bg-[#f5f6fa] p-2 md:p-3">
      <div className="flex flex-1 min-h-0 rounded-2xl bg-white shadow-sm overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <main className="flex-1 flex flex-col min-w-0 min-h-0">{renderContent()}</main>
          <BottomNav />
        </div>
      </div>
      <CustomerModal />
      <CheckoutModal />
      <PrinterSettingsModal />
      <AppSettingsModal />
      <ConfirmDialog />
      <ToastContainer />
    </div>
  )
}
