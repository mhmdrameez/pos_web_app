export interface CartItem {
  id: string
  name: string
  unitPricePaise: number
  quantity: number
}

export interface Customer {
  name: string
  phone: string
  email?: string
}

export type PaymentMethod = 'cash' | 'upi' | 'card'

export type OrderStatus = 'draft' | 'completed' | 'cancelled'

export interface SavedOrder {
  id: string
  orderNumber: string
  createdAt: number
  updatedAt: number
  customer?: Customer
  items: CartItem[]
  subtotalPaise: number
  taxPaise: number
  discountPaise: number
  grandTotalPaise: number
  status: OrderStatus
}

export interface CompletedSale extends SavedOrder {
  invoiceNumber: string
  paymentMethod: PaymentMethod
  amountPaidPaise?: number
  changePaise?: number
  completedAt: number
}

export interface AppSettings {
  businessName: string
  taxRatePercent: number
}

export interface PrinterSettings {
  paperWidth: 58 | 80
  deviceId?: string
  deviceName?: string
}

export type SidebarView =
  | 'quick-sale'
  | 'saved-orders'
  | 'sales-history'
  | 'printer-settings'
  | 'app-settings'

export type BottomTab = 'sale' | 'quick-sale' | 'saved-orders'

export interface CartSnapshot {
  items: CartItem[]
  currentAmount: string
  customer: Customer | null
  discountPaise: number
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}
