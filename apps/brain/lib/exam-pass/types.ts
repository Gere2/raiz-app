/**
 * Bono Supervivencia Exámenes — tipos canónicos.
 *
 * MUST MIRROR: apps/app/lib/exam-pass/types.ts
 * Cualquier cambio aquí debe replicarse byte-a-byte en el archivo gemelo.
 * Si un día crece la complejidad, mover a packages/shared/exam-pass/.
 *
 * Los IDs de producto/leche/extra/repostería son cerrados: cualquier valor que
 * llegue al servidor fuera de estos sets debe ser rechazado.
 */

// ── IDs del catálogo ──────────────────────────────────────────────

export type IncludedProductId =
  | "cafe_solo"
  | "americano"
  | "cortado"
  | "cafe_con_leche"

export type PremiumProductId =
  | "matcha_hot"
  | "chai_hot"
  | "iced_coffee"
  | "iced_matcha"
  | "iced_chai"

export type ProductId = IncludedProductId | PremiumProductId

export type MilkId = "whole" | "lactose_free" | "oat" | "almond"

export type ExtraId = "extra_shot" | "large_size" | "iced_version"

export type PastryId = "cookie" | "cake"

export type Locale = "es" | "en"

// ── Estados ───────────────────────────────────────────────────────

/**
 * Ciclo de vida del bono.
 * - pending: payment intent creado, esperando confirmación de pago.
 * - active: pagado y operativo.
 * - expired: pasaron 60 días desde la activación.
 * - completed: 0 créditos restantes.
 * - canceled: la compra se canceló antes de cobrarse (Stripe canceled/failed).
 *             Difiere de `refunded` (reembolso después de cobro).
 * - refunded: reembolso manual tras un cobro confirmado.
 */
export type ExamPassStatus =
  | "pending"
  | "active"
  | "expired"
  | "completed"
  | "canceled"
  | "refunded"

/**
 * Ciclo de vida de un canje. Dos fases para evitar doble descuento:
 * reservado → consumido (al confirmar pago/pedido) o liberado (si falla).
 */
export type RedemptionStatus = "reserved" | "consumed" | "released"

// ── Documentos persistidos ───────────────────────────────────────

/** Firestore: exam_passes/{id} */
export interface ExamPass {
  id: string
  orgId: string
  userId: string
  status: ExamPassStatus
  /** Precio cobrado al usuario en €. */
  purchasePrice: 20 | 22
  /** Total de créditos del bono (siempre 10 en v1). */
  creditsTotal: number
  /** Créditos consumidos hasta ahora. */
  creditsUsed: number
  /** Créditos reservados pendientes de confirmación de pago. */
  creditsReserved: number
  /** ISO. Fecha de activación (cuando el pago confirmó). */
  purchasedAt: string | null
  /** ISO. purchasedAt + VALIDITY_DAYS. Null mientras pending. */
  expiresAt: string | null
  /** Stripe PaymentIntent que pagó este bono. */
  paymentIntentId: string | null
  /** ISO del último canje consumido. */
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
  /** Origen de la compra. Ausente en passes antiguos = "online". */
  purchaseSource?: "online" | "in_store"
  /** Si purchaseSource = in_store, método físico usado. */
  paymentMethod?: "cash" | "card_terminal"
  /** UID del barista que activó el bono en tienda (cobro presencial). */
  grantedByStaffId?: string
  /** Nota libre opcional del barista al activar. */
  grantedByNote?: string
}

/** Firestore: exam_pass_redemptions/{id} */
export interface ExamPassRedemption {
  id: string
  passId: string
  userId: string
  orgId: string
  /** Order asociada (si > 0 € o ya creada). */
  orderId: string | null
  status: RedemptionStatus

  // Pedido
  productId: ProductId
  productName: string
  milkId: MilkId | null
  extras: ExtraId[]
  pastryId: PastryId | null

  // Desglose monetario en € (siempre redondeado a 2 decimales).
  basePremiumSupplement: number
  milkSupplement: number
  extrasSupplement: number
  pastrySupplement: number
  totalSupplement: number

  // Trazas
  /** ISO de la reserva del crédito. */
  reservedAt: string
  /** ISO del consumo definitivo (pago confirmado). */
  consumedAt: string | null
  /** ISO de la liberación (si aplica). */
  releasedAt: string | null
  releasedReason: string | null
  /** PaymentIntent (si > 0 €). */
  paymentIntentId: string | null
  /**
   * Clave para idempotencia en transición reserved→consumed.
   * Formato: "{passId}:{redemptionId}".
   */
  idempotencyKey: string
  /** "YYYY-MM-DD" en zona Europe/Madrid. Permite contar usos del día. */
  redemptionDayKey: string
  createdAt: string
}

// ── DTOs de cálculo ──────────────────────────────────────────────

/** Lo que el cliente envía para construir un pedido con bono. */
export interface ExamPassOrderInput {
  productId: ProductId
  milkId?: MilkId | null
  extras?: ExtraId[]
  pastryId?: PastryId | null
}

/**
 * Resultado de calcular un pedido con bono.
 * Mismo shape que se muestra en UI y se valida en server.
 */
export interface ExamPassOrderQuote {
  productId: ProductId
  productName: string
  productNameEn: string
  isPremium: boolean

  milkId: MilkId | null
  extras: ExtraId[]
  pastryId: PastryId | null

  // Desglose en € (2 decimales)
  basePremiumSupplement: number
  milkSupplement: number
  extrasSupplement: number
  pastrySupplement: number
  totalSupplement: number

  /** Siempre 1 — cada bebida del bono usa exactamente 1 crédito. */
  creditsUsed: 1
}

export type OrderValidationError =
  | "PRODUCT_NOT_FOUND"
  | "MILK_NOT_ALLOWED_FOR_PRODUCT"
  | "MILK_INVALID"
  | "EXTRA_INVALID"
  | "EXTRA_ICED_REDUNDANT"
  | "PASTRY_INVALID"

export type OrderValidationResult =
  | { ok: true; quote: ExamPassOrderQuote }
  | { ok: false; error: OrderValidationError }

// ── Elegibilidad para reservar/canjear ───────────────────────────

export type EligibilityReason =
  | "PASS_NOT_FOUND"
  | "PASS_PENDING_PAYMENT"
  | "PASS_NOT_ACTIVE"
  | "PASS_EXPIRED"
  | "NO_CREDITS"

export interface RedemptionEligibility {
  ok: boolean
  reason?: EligibilityReason
  /** Créditos disponibles ahora mismo: usados < total y no reservados. */
  creditsAvailable: number
  /** ISO; cuándo expira. */
  expiresAt: string | null
}
