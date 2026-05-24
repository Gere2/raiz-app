/**
 * types/order.ts — Tipos unificados de pedidos
 * Compatibles con: orders (App), tickets (POS), teacher_orders
 */

export type OrderSource = "APP" | "POS" | "TEACHER"

export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "IN_QUEUE"
  | "PREPARING"
  | "READY"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELED"

export type PaymentMethod = "CASH" | "CARD" | "STRIPE"
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED"

export interface UnifiedOrderItem {
  productId: string
  productName: string
  unitPrice: number
  qty: number
  modifiers?: { name: string; priceDelta: number }[]
}

export interface OrderEnrichment {
  dayOfWeek?: number
  hourOfDay?: number
  timeSlot?: string
  weekNumber?: number
  monthOfYear?: number
  isWeekend?: boolean
  isHoliday?: boolean
  academicPeriod?: string
  isExamWeek?: boolean
  season?: string
  weatherTemp?: number
  weatherCondition?: string
  weatherBand?: string
  isRainy?: boolean
  hasCombo?: boolean
  itemCount?: number
  uniqueItems?: number
  categoryNames?: string[]
}

export interface UnifiedOrder {
  id: string
  source: OrderSource
  orgId?: string

  // Cliente
  customerUid?: string
  customerName?: string
  customerEmail?: string
  customerSegment?: string

  // Items
  items: UnifiedOrderItem[]
  total: number
  notes?: string

  // Pickup
  pickupType?: "ASAP" | "SCHEDULED"
  pickupTimeLabel?: string
  pickupAt?: unknown

  // Pago
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentId?: string

  // Estado
  status: OrderStatus

  // Staff
  staffId?: string
  staffName?: string

  // Teacher-specific
  deliveryType?: "classroom" | "pickup"
  classroom?: string
  teacherName?: string

  // Customer POS metadata
  customerFrequency?: "habitual" | "recurrente" | "extraño" | null
  customerRole?: "alumno" | "profesor" | null

  // Tiempos
  createdAt: unknown
  updatedAt?: unknown
  paidAt?: unknown
  completedAt?: unknown
  preparationTimeSecs?: number

  // Enrichment
  enrichment?: OrderEnrichment
}

// Re-export legacy types for backwards compatibility
export type { OrderItem, AppOrder } from "../types"
