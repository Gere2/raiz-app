"use client"

/**
 * Bono Supervivencia Exámenes — service cliente.
 *
 * Llama a las rutas proxy locales `/api/exam-pass/*` (mismo origen, sin CORS).
 * Cada llamada inyecta el ID token Firebase del usuario actual.
 *
 * Convención: todas las funciones devuelven Result<T> en lugar de lanzar.
 * Los errores que vienen de Brain mantienen su `error` (código estable),
 * `message` y `details`. Errores de red/auth se traducen a códigos locales.
 */

import { auth } from "../firebase"
import type {
  ExamPass,
  ExamPassOrderInput,
  ExamPassOrderQuote,
  ExamPassRedemption,
} from "./types"

const DEFAULT_ORG = "raiz_y_grano"

// ── Result + Error types ──────────────────────────────────────────

export interface ExamPassClientError {
  /**
   * Código estable. Espejo de los códigos del backend (ver
   * apps/brain/lib/exam-pass/http-errors.ts) más algunos locales:
   *  - "NOT_AUTHENTICATED": no hay sesión Firebase activa.
   *  - "NETWORK_ERROR": fallo de fetch (offline, etc.).
   *  - "PARSE_ERROR": respuesta no JSON.
   */
  error: string
  message?: string
  details?: Record<string, unknown>
  /** HTTP status si la llamada llegó al servidor. */
  status?: number
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExamPassClientError }

// ── Response shapes (espejo del backend Brain) ────────────────────

export interface QuoteData {
  orgId: string
  price: 20 | 22
  priceCents: number
  currency: "EUR"
  soldCount: number
  earlyBirdRemaining: number
}

export interface PurchaseInitData {
  passId: string
  clientSecret: string
  paymentIntentId: string
  price: 20 | 22
  priceCents: number
  currency: "EUR"
  soldCount?: number
  earlyBirdRemaining?: number
  reusedPending: boolean
}

export type MeData =
  | {
      state: "active"
      pass: ExamPass
      creditsAvailable: number
    }
  | {
      state: "pending"
      pass: ExamPass
    }
  | {
      state: "none"
    }

export interface RedeemData {
  ok: true
  /**
   * True si el pedido tiene suplemento que el cliente debe pagar al
   * recogerlo en barra. False si total === 0 € (la base la cubre el bono).
   * Sin Stripe en ningún caso.
   */
  requiresInStorePayment: boolean
  redemption: ExamPassRedemption
  pass: ExamPass
  creditsAvailable: number
  quote: ExamPassOrderQuote
}

// ── Internal call helper ──────────────────────────────────────────

interface ErrorBody {
  error?: string
  message?: string
  details?: Record<string, unknown>
}

/**
 * Timeout por defecto de las llamadas del bono. Brain con cold start tarda
 * ~1-3 s; 6 s deja margen. Si pasa, devolvemos error y la UI cae al
 * fallback (cache local o card de venta) — nunca bloqueamos la home.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 6000

async function call<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Result<T>> {
  const user = auth.currentUser
  if (!user) {
    return {
      ok: false,
      error: { error: "NOT_AUTHENTICATED", message: "No hay sesión activa" },
    }
  }

  let token: string
  try {
    token = await user.getIdToken()
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NOT_AUTHENTICATED",
        message: err instanceof Error ? err.message : "No se pudo obtener token",
      },
    }
  }

  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)

  // Timeout via AbortController. Si Brain está colgado, no esperamos infinito.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(path, { ...init, headers, signal: ctrl.signal })
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"))
    return {
      ok: false,
      error: {
        error: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? `Brain no respondió en ${timeoutMs} ms`
          : err instanceof Error
            ? err.message
            : "Error de red",
      },
    }
  } finally {
    clearTimeout(timer)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return {
      ok: false,
      error: {
        error: "PARSE_ERROR",
        message: "Respuesta no JSON",
        status: res.status,
      },
    }
  }

  if (!res.ok) {
    const errBody = (body ?? {}) as ErrorBody
    return {
      ok: false,
      error: {
        error: errBody.error ?? "INTERNAL_ERROR",
        message: errBody.message,
        details: errBody.details,
        status: res.status,
      },
    }
  }

  return { ok: true, data: body as T }
}

// ── Public API ────────────────────────────────────────────────────

// ── TEST MODE ─────────────────────────────────────────────────────
// Las dos funciones siguientes solo deben llamarse desde UI marcada como
// modo test. Brain las acepta sólo si ENABLE_EXAM_PASS_TEST_MODE=true; en
// otro caso devuelven 404. La flag NEXT_PUBLIC_ENABLE_EXAM_PASS_TEST_MODE
// del cliente se usa SOLO para decidir si renderizar el botón — NO es la
// autoridad: la autoridad vive en Brain.

/** True si la app debe renderizar los botones de test. */
export function isExamPassTestModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_EXAM_PASS_TEST_MODE === "true"
}

/** Tipo de respuesta para activate-purchase test. */
export interface TestActivatePurchaseData {
  ok: true
  pass: ExamPass
  alreadyActive: boolean
}

/** Tipo de respuesta para consume-redemption test. */
export interface TestConsumeRedemptionData {
  ok: true
  redemption: ExamPassRedemption
  pass: ExamPass | null
  alreadyConsumed: boolean
}

/**
 * MODO TEST — simula un `payment_intent.succeeded` para una compra de bono.
 * No usar en producción. Brain rechaza con 404 si su flag server no está on.
 */
export function testActivatePurchase(
  passId: string,
  orgId: string = DEFAULT_ORG,
): Promise<Result<TestActivatePurchaseData>> {
  return call<TestActivatePurchaseData>(
    `/api/exam-pass/test/activate-purchase?org=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passId }),
    },
  )
}

/**
 * MODO TEST — simula un `payment_intent.succeeded` para un canje con
 * suplemento. Pasa la redemption de reserved a consumed.
 */
export function testConsumeRedemption(
  redemptionId: string,
  orgId: string = DEFAULT_ORG,
): Promise<Result<TestConsumeRedemptionData>> {
  return call<TestConsumeRedemptionData>(
    `/api/exam-pass/test/consume-redemption?org=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redemptionId }),
    },
  )
}

// ── PUBLIC API ────────────────────────────────────────────────────

/**
 * GET /api/exam-pass/quote — precio actual + stock early-bird.
 *
 * Endpoint PÚBLICO: no exige sesión. Permite mostrar la card de venta a
 * visitantes anónimos sin obligarles a registrarse antes.
 */
export async function fetchQuote(
  orgId: string = DEFAULT_ORG,
): Promise<Result<QuoteData>> {
  const path = `/api/exam-pass/quote?org=${encodeURIComponent(orgId)}`
  let res: Response
  try {
    res = await fetch(path, { cache: "no-store" })
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Error de red",
      },
    }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return {
      ok: false,
      error: {
        error: "PARSE_ERROR",
        message: "Respuesta no JSON",
        status: res.status,
      },
    }
  }
  if (!res.ok) {
    const errBody = (body ?? {}) as ErrorBody
    return {
      ok: false,
      error: {
        error: errBody.error ?? "INTERNAL_ERROR",
        message: errBody.message,
        details: errBody.details,
        status: res.status,
      },
    }
  }
  return { ok: true, data: body as QuoteData }
}

/** GET /api/exam-pass/me — estado del bono del usuario. */
export function fetchMe(orgId: string = DEFAULT_ORG): Promise<Result<MeData>> {
  return call<MeData>(
    `/api/exam-pass/me?org=${encodeURIComponent(orgId)}`,
    { cache: "no-store" },
  )
}

/** POST /api/exam-pass/purchase-init — crea/reusa pass pending + PI. */
export function purchaseInit(
  orgId: string = DEFAULT_ORG,
): Promise<Result<PurchaseInitData>> {
  return call<PurchaseInitData>(
    `/api/exam-pass/purchase-init?org=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
}

/**
 * POST /api/exam-pass/cancel-pending — cancela el(los) pending del caller.
 *
 * Para usar cuando el usuario abandonó un pago y vuelve a la app: en vez
 * de quedarse con banner "confirmando" indefinidamente, ofrece cancelar y
 * empezar de nuevo.
 */
export interface CancelPendingData {
  ok: true
  canceled: number
}
export function cancelPendingPurchase(
  orgId: string = DEFAULT_ORG,
): Promise<Result<CancelPendingData>> {
  return call<CancelPendingData>(
    `/api/exam-pass/cancel-pending?org=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
}

/**
 * POST /api/exam-pass/redeem — reserva (y consume si total = 0) un canje.
 *
 * El cliente envía solo selección (productId + leche + extras + pastry).
 * Brain recalcula `quote` server-side con `computeOrder`. Si la respuesta
 * incluye `requiresPayment: true`, el cliente debe confirmar el `clientSecret`
 * con Stripe Elements; el webhook (Fase 3C) consume el crédito al confirmar.
 */
export function redeem(
  input: ExamPassOrderInput,
  orgId: string = DEFAULT_ORG,
): Promise<Result<RedeemData>> {
  return call<RedeemData>(
    `/api/exam-pass/redeem?org=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
}
