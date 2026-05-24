/**
 * exam-pass-admin-service.ts
 *
 * Servicio cliente para que el POS active bonos cobrados físicamente en
 * tienda. Llama a los proxies same-origin del POS, que reenvían a Brain.
 */

"use client"

import type { User } from "firebase/auth"
import { authedFetch } from "./authed-fetch"

export type PaymentMethod = "cash" | "card_terminal"

export interface ExamPassQuote {
  orgId: string
  price: 20 | 22
  priceCents: number
  currency: "EUR"
  soldCount: number
  earlyBirdRemaining: number
}

export interface GrantedPass {
  id: string
  orgId: string
  userId: string
  status: string
  purchasePrice: 20 | 22
  creditsTotal: number
  expiresAt: string | null
  purchasedAt: string | null
  paymentMethod?: PaymentMethod
  grantedByStaffId?: string
}

export interface ExamPassError {
  error: string
  message?: string
  /**
   * Detalles opcionales del backend. Para `ACTIVE_PASS_EXISTS` incluye
   * los campos del pass activo del cliente para que el toast informe
   * al barista (créditos restantes, expiración).
   */
  details?: {
    existingPassId?: string
    creditsUsed?: number
    creditsReserved?: number
    creditsTotal?: number
    expiresAt?: string | null
    purchasedAt?: string | null
  }
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExamPassError }

/**
 * Lee el precio actual del bono. Server lo recalcula cada vez (early-bird vs
 * standard según contador de bonos vendidos). Llamar al abrir el modal.
 */
export async function fetchExamPassQuote(
  user: User,
  orgId: string,
): Promise<Result<ExamPassQuote>> {
  try {
    const res = await authedFetch(
      user,
      `/api/org/${encodeURIComponent(orgId)}/exam-pass/quote`,
    )
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json as ExamPassError }
    return { ok: true, data: json as ExamPassQuote }
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Error de red",
      },
    }
  }
}

interface GrantInput {
  userId: string
  paymentMethod: PaymentMethod
  note?: string
}

interface GrantResponse {
  ok: true
  pass: GrantedPass
  quote: ExamPassQuote
}

// ── Canje en barra (consume crédito + cobra suplementos cash/datáfono) ──

export interface BonoOrderInput {
  productId: string
  milkId?: string | null
  extras?: string[]
  pastryId?: string | null
}

interface RedeemInStoreInput {
  userId: string
  input: BonoOrderInput
  paymentMethod: PaymentMethod
  note?: string
}

export interface RedeemedRedemption {
  id: string
  passId: string
  userId: string
  status: string
  productId: string
  productName: string
  totalSupplement: number
  consumedAt: string | null
}

export interface ActivePass {
  id: string
  userId: string
  status: string
  creditsUsed: number
  creditsReserved: number
  creditsTotal: number
  expiresAt: string | null
  purchasedAt: string | null
}

interface RedeemResponse {
  ok: true
  redemption: RedeemedRedemption
  pass: ActivePass
  quote: {
    productId: string
    productName: string
    isPremium: boolean
    milkId: string | null
    extras: string[]
    pastryId: string | null
    basePremiumSupplement: number
    milkSupplement: number
    extrasSupplement: number
    pastrySupplement: number
    totalSupplement: number
  }
}

/**
 * Canjea 1 crédito del bono y registra que el barista cobró el suplemento
 * en barra. Brain valida staff + elegibilidad (créditos, expiry).
 */
export async function redeemBonoInStore(
  user: User,
  orgId: string,
  input: RedeemInStoreInput,
): Promise<Result<RedeemResponse>> {
  try {
    const res = await authedFetch(
      user,
      `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/redeem`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: input.userId,
          productId: input.input.productId,
          ...(input.input.milkId ? { milkId: input.input.milkId } : {}),
          ...(input.input.extras && input.input.extras.length > 0
            ? { extras: input.input.extras }
            : {}),
          ...(input.input.pastryId ? { pastryId: input.input.pastryId } : {}),
          paymentMethod: input.paymentMethod,
          ...(input.note ? { note: input.note } : {}),
        }),
      },
    )
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json as ExamPassError }
    return { ok: true, data: json as RedeemResponse }
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Error de red",
      },
    }
  }
}

// ── Estado del bono del cliente (para mostrar antes de canjear) ─────

export interface CustomerBonoStatus {
  state: "active" | "pending" | "none"
  pass: ActivePass | null
  creditsAvailable: number
}

/**
 * Lee el estado del bono de un cliente. Lo usamos al abrir el modal de
 * canje para mostrar al barista cuántos cafés le quedan al cliente.
 */
export async function fetchCustomerBonoStatus(
  user: User,
  orgId: string,
  userId: string,
): Promise<Result<CustomerBonoStatus>> {
  try {
    const res = await authedFetch(
      user,
      `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/customer-status?userId=${encodeURIComponent(userId)}`,
    )
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json as ExamPassError }
    return { ok: true, data: json as CustomerBonoStatus }
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Error de red",
      },
    }
  }
}

/**
 * Activa el bono al cliente. El UID es el del cliente (Firebase Auth doc ID en
 * customer_profiles). Brain valida que el caller (token del barista) sea
 * staff. Devuelve el pass `active` ya creado.
 */
export async function grantBonoInStore(
  user: User,
  orgId: string,
  input: GrantInput,
): Promise<Result<GrantResponse>> {
  try {
    const res = await authedFetch(
      user,
      `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/grant`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: input.userId,
          paymentMethod: input.paymentMethod,
          ...(input.note ? { note: input.note } : {}),
        }),
      },
    )
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json as ExamPassError }
    return { ok: true, data: json as GrantResponse }
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Error de red",
      },
    }
  }
}
