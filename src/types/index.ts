import type { LineNameSource } from './suggestion'

export interface CartItem {
  id: string
  name: string
  unitPricePaise: number
  quantity: number
  nameSource?: LineNameSource
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
  emailSentAt?: number
  appliedCouponCode?: string
  issuedCouponCode?: string
}

export interface Coupon {
  id: string
  code: string
  amountPaise: number
  status: 'active' | 'used' | 'expired' | 'cancelled'
  createdAt: number
  usedAt?: number
  expiresAt?: number
  customerName?: string
}

export interface EmailSettings {
  resendApiKey: string
  fromEmail: string
  toEmail: string
}

export interface SupabaseSettings {
  projectUrl: string
  anonKey: string
  enabled: boolean
  backupBucketName?: string
}

export interface BackupSettings {
  autoBackup10pmEnabled: boolean
  autoBackupFrequency?: '10pm' | '12h'
  lastBackupDate?: string
}

export interface AppSettings {
  businessName: string
  emailSettings?: EmailSettings
  supabaseSettings?: SupabaseSettings
  backupSettings?: BackupSettings
}

export interface PairedPrinter {
  id: string
  name: string
}

export interface PrinterSettings {
  paperWidth: 58 | 80
  deviceId?: string
  deviceName?: string
  pairedPrinters?: PairedPrinter[]
  showSuggestions?: boolean
}

export type SidebarView =
  | 'quick-sale'
  | 'saved-orders'
  | 'sales-history'
  | 'products'
  | 'coupons'
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
