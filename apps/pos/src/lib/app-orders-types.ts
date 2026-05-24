/**
 * Estados para pedidos de la APP de clientes.
 * Flujo: CREATED → IN_QUEUE → PREPARING → READY → PICKED_UP
 * (Distinto de teacher_orders que usa: pending → preparing → ready → delivered)
 */

export type AppOrderStatus =
  | "CREATED"
  | "IN_QUEUE"
  | "PREPARING"
  | "READY"
  | "PICKED_UP"
  | "CANCELED"

export const APP_STATUS_FLOW: AppOrderStatus[] = [
  "CREATED",
  "IN_QUEUE",
  "PREPARING",
  "READY",
  "PICKED_UP",
]

export const APP_STATUS_CONFIG: Record<
  AppOrderStatus,
  { label: string; color: string; bg: string; textColor: string; action?: string }
> = {
  CREATED: {
    label: "Nuevo",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
    textColor: "text-violet-900",
    action: "Poner en cola",
  },
  IN_QUEUE: {
    label: "En cola",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    textColor: "text-blue-900",
    action: "Preparar",
  },
  PREPARING: {
    label: "Preparando",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    textColor: "text-amber-900",
    action: "Marcar listo",
  },
  READY: {
    label: "LISTO",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    textColor: "text-emerald-900",
    action: "Entregado",
  },
  PICKED_UP: {
    label: "Recogido",
    color: "text-gray-500",
    bg: "bg-gray-50 border-gray-200",
    textColor: "text-gray-700",
  },
  CANCELED: {
    label: "Cancelado",
    color: "text-red-500",
    bg: "bg-red-50 border-red-200",
    textColor: "text-red-700",
  },
}

/** Tipo para un pedido APP tal como sale de Firestore */
export type AppOrder = {
  id: string
  source: "APP" | "TEACHER_APP"
  customerUid?: string
  customerName: string
  customerEmail?: string
  notes?: string | null

  pickupType: "ASAP" | "SCHEDULED"
  pickupTimeLabel?: string | null
  pickupAt?: { toMillis?: () => number } | null

  status: AppOrderStatus
  paymentStatus?: "PENDING" | "PAID" | "SKIPPED"

  items: {
    productId: string
    productName: string
    unitPrice: number
    qty: number
    isCombo?: boolean
    comboId?: string
    slotChoices?: { slotLabel: string; choiceName: string }[]
  }[]

  total: number
  createdAt?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  updatedAt?: any // eslint-disable-line @typescript-eslint/no-explicit-any

  // Teacher-specific fields (present when source="TEACHER_APP")
  teacherUid?: string
  teacherName?: string
  teacherEmail?: string
  delivery?: {
    location: string
    locationDetail: string
    deliveryTime: string
    deliveryDate: string
    recipientName: string
    department?: string
    attendees?: number
    contactPhone?: string
    notes?: string
  }
  skipPayment?: boolean
}
