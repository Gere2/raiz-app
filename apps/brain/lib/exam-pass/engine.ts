/**
 * Bono Supervivencia Exámenes — engine server-side.
 *
 * Encapsula TODO el acceso a Firestore relacionado con el bono. Endpoints HTTP
 * (Fase 3B) y webhook Stripe (Fase 3C) llaman a estas funciones; ningún otro
 * camino puede mutar exam_passes / exam_pass_redemptions / exam_pass_counters.
 *
 * Garantías:
 * - Todas las mutaciones críticas viven en `runTransaction` y son idempotentes
 *   por status. Repetir una transición ya aplicada devuelve `ok: true` con
 *   `alreadyX: true`, sin volver a tocar contadores.
 * - El crédito NUNCA se consume antes de que el pago se confirme: la engine
 *   solo expone `reserveRedemption` (no consume), `consumeRedemption` (consume
 *   atómicamente reserved → consumed) y `releaseRedemption` (libera).
 * - El contador early-bird se incrementa SOLO en `activateExamPassFromPayment`,
 *   y solo cuando la transición pending → active sucede de verdad.
 * - El precio se recalcula en servidor en cada llamada; jamás se confía en lo
 *   que el cliente envía.
 *
 * Esta capa NO conoce Stripe; recibe `paymentIntentId` y `paidAmountCents`
 * como argumentos. La integración con Stripe vive en endpoints/webhook.
 */

import { db as adminDb, FieldValue } from "../firebase-admin"
import {
  EXAM_PASS_PRICING,
  EXAM_PASS_RULES,
} from "./config"
import {
  computeExpiresAt,
  computeOrder,
  creditsAvailable,
  dayKeyMadrid,
  eligibilityForReservation,
  isPassActive,
  priceForSoldCount,
} from "./calc"
import type {
  ExamPass,
  ExamPassOrderInput,
  ExamPassOrderQuote,
  ExamPassRedemption,
  RedemptionEligibility,
} from "./types"

// ── Constantes de colección (deben coincidir con firestore.rules) ─

const COLL_PASSES = "exam_passes"
const COLL_REDEMPTIONS = "exam_pass_redemptions"
const COLL_COUNTERS = "exam_pass_counters"

// ── 1) getExamPassQuote ───────────────────────────────────────────

export interface ExamPassQuote {
  orgId: string
  price: 20 | 22
  priceCents: number
  currency: "EUR"
  /** Cuántos bonos se han vendido (con pago confirmado) en esta org. */
  soldCount: number
  /** Cuántos bonos quedan al precio early-bird; 0 si ya estamos en standard. */
  earlyBirdRemaining: number
}

/**
 * Devuelve el precio actual para esta org. Lectura simple del contador;
 * NUNCA confíes en un precio enviado por el cliente.
 */
export async function getExamPassQuote(orgId: string): Promise<ExamPassQuote> {
  const counterRef = adminDb.collection(COLL_COUNTERS).doc(orgId)
  const snap = await counterRef.get()
  const soldCount = snap.exists ? Number(snap.data()?.count ?? 0) : 0
  const price = priceForSoldCount(soldCount)
  return {
    orgId,
    price,
    priceCents: price * 100,
    currency: "EUR",
    soldCount,
    earlyBirdRemaining: Math.max(0, EXAM_PASS_PRICING.EARLY_BIRD_LIMIT - soldCount),
  }
}

// ── 2) initExamPassPurchase ───────────────────────────────────────

export interface InitPurchaseInput {
  orgId: string
  userId: string
}

export type InitPurchaseResult =
  | { ok: true; pass: ExamPass; quote: ExamPassQuote }
  | { ok: false; error: "INVALID_INPUT" }

/**
 * Crea el documento `exam_passes` con `status: "pending"` y precio recalculado
 * server-side. NO toca el contador (eso pasa en la activación). NO crea el
 * PaymentIntent: eso lo hace el endpoint con la `quote.price` que devolvemos.
 *
 * El endpoint debe usar `pass.id` como `metadata.examPassId` al crear el PI,
 * y luego asociar el `paymentIntentId` resultante con
 * `attachPaymentIntentToPass(pass.id, paymentIntentId)`.
 */
export async function initExamPassPurchase(input: InitPurchaseInput): Promise<InitPurchaseResult> {
  if (!input.orgId || !input.userId) return { ok: false, error: "INVALID_INPUT" }

  const quote = await getExamPassQuote(input.orgId)
  const now = new Date().toISOString()
  const ref = adminDb.collection(COLL_PASSES).doc()
  const pass: ExamPass = {
    id: ref.id,
    orgId: input.orgId,
    userId: input.userId,
    status: "pending",
    purchasePrice: quote.price,
    creditsTotal: EXAM_PASS_RULES.CREDITS_TOTAL,
    creditsUsed: 0,
    creditsReserved: 0,
    purchasedAt: null,
    expiresAt: null,
    paymentIntentId: null,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await ref.set(pass)
  return { ok: true, pass, quote }
}

/**
 * Asocia el PaymentIntent al pass pending recién creado.
 * Idempotente: si ya tiene un PI guardado y coincide, ok; si no coincide en
 * estado pending, sobreescribe (último wins — útil si el endpoint reintentó
 * crear el PI). Si el pass ya está activo, no toca nada.
 */
export async function attachPaymentIntentToPass(
  passId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; error?: "PASS_NOT_FOUND" | "INVALID_STATE" }> {
  const ref = adminDb.collection(COLL_PASSES).doc(passId)
  return await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { ok: false, error: "PASS_NOT_FOUND" as const }
    const pass = snap.data() as ExamPass
    if (pass.status !== "pending") {
      // Ya activado, expirado, etc. — no nos toca tocar nada aquí.
      return { ok: false, error: "INVALID_STATE" as const }
    }
    tx.update(ref, {
      paymentIntentId,
      updatedAt: new Date().toISOString(),
    })
    return { ok: true }
  })
}

// ── 3) activateExamPassFromPayment ────────────────────────────────

export interface ActivatePassInput {
  passId: string
  paymentIntentId: string
  paidAmountCents: number
}

export type ActivatePassResult =
  | { ok: true; pass: ExamPass; alreadyActive?: boolean }
  | { ok: false; error: "PASS_NOT_FOUND" | "INVALID_STATE" | "AMOUNT_MISMATCH" | "PAYMENT_INTENT_MISMATCH" }

/**
 * Llamado por el webhook Stripe en `payment_intent.succeeded`.
 * Transición atómica pending → active + incremento del contador.
 *
 * Idempotente: si el pass ya está active, devuelve ok sin re-incrementar.
 * Esto cubre los reintentos de Stripe (webhook entregado dos veces).
 */
export async function activateExamPassFromPayment(input: ActivatePassInput): Promise<ActivatePassResult> {
  const passRef = adminDb.collection(COLL_PASSES).doc(input.passId)

  return await adminDb.runTransaction(async (tx) => {
    const passSnap = await tx.get(passRef)
    if (!passSnap.exists) return { ok: false, error: "PASS_NOT_FOUND" as const }

    const pass = passSnap.data() as ExamPass

    // Idempotencia: si ya está activo y el PaymentIntent coincide, ok.
    if (pass.status === "active") {
      if (pass.paymentIntentId && pass.paymentIntentId !== input.paymentIntentId) {
        return { ok: false, error: "PAYMENT_INTENT_MISMATCH" as const }
      }
      return { ok: true, pass: { ...pass, id: passRef.id } as ExamPass, alreadyActive: true }
    }

    if (pass.status !== "pending") {
      // expired/completed/refunded no deberían recibir webhooks de pago.
      return { ok: false, error: "INVALID_STATE" as const }
    }

    // Verificar que el PaymentIntent esperado coincide (si se asoció antes).
    if (pass.paymentIntentId && pass.paymentIntentId !== input.paymentIntentId) {
      return { ok: false, error: "PAYMENT_INTENT_MISMATCH" as const }
    }

    // Verificar amount cobrado vs precio del bono. Stripe es la fuente de
    // verdad de cuánto se ha cobrado de verdad.
    const expectedCents = pass.purchasePrice * 100
    if (input.paidAmountCents !== expectedCents) {
      return { ok: false, error: "AMOUNT_MISMATCH" as const }
    }

    const now = new Date()
    const expiresAt = computeExpiresAt(now)
    const updates = {
      status: "active" as const,
      purchasedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      paymentIntentId: input.paymentIntentId,
      updatedAt: now.toISOString(),
    }
    tx.update(passRef, updates)

    // Incrementar contador early-bird. Solo aquí — y solo en la transición
    // efectiva pending → active.
    const counterRef = adminDb.collection(COLL_COUNTERS).doc(pass.orgId)
    tx.set(counterRef, {
      orgId: pass.orgId,
      count: FieldValue.increment(1),
      updatedAt: now.toISOString(),
    }, { merge: true })

    return { ok: true, pass: { ...pass, ...updates, id: passRef.id } as ExamPass }
  })
}

// ── 3.5) grantExamPassInStore ─────────────────────────────────────

export interface GrantInStoreInput {
  orgId: string
  userId: string
  paymentMethod: "cash" | "card_terminal"
  /** UID del barista (caller staff) que activa la compra. Trazabilidad. */
  grantedByStaffId: string
  /** Nota libre opcional. */
  note?: string
}

export type GrantInStoreResult =
  | { ok: true; pass: ExamPass; quote: ExamPassQuote }
  | { ok: false; error: "INVALID_INPUT" }
  | { ok: false; error: "ACTIVE_PASS_EXISTS"; existingPass: ExamPass }

/**
 * Activa un bono cobrado físicamente en tienda (datáfono o efectivo).
 * Salta el ciclo pending → active porque el pago ya ocurrió fuera de Stripe;
 * el barista es la fuente de verdad. Misma transacción atómica que la
 * activación normal: crea pass + incrementa contador early-bird.
 *
 * Si el usuario tenía un pass `pending` (intento Stripe abandonado), se cancela
 * antes para que no quede huérfano. Si tiene un `active`, fallamos con
 * ACTIVE_PASS_EXISTS — la UI POS debe avisar al barista para no doble-cobrar.
 */
export async function grantExamPassInStore(
  input: GrantInStoreInput,
): Promise<GrantInStoreResult> {
  if (!input.orgId || !input.userId || !input.grantedByStaffId) {
    return { ok: false, error: "INVALID_INPUT" }
  }
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "card_terminal") {
    return { ok: false, error: "INVALID_INPUT" }
  }

  // Bloquea si ya hay active. Query fuera de la transacción (Firestore admin
  // no soporta where() dentro de runTransaction), pero es server-side y la
  // ventana de race es mínima.
  const active = await getActiveExamPassForUser(input.userId, input.orgId)
  if (active) {
    // Devolvemos el pass existente para que la UI POS muestre detalles
    // (créditos restantes, expiración) en el toast del barista.
    return { ok: false, error: "ACTIVE_PASS_EXISTS", existingPass: active }
  }

  // Si tiene pending de Stripe abandonado, lo cancelamos para que no quede
  // huérfano. Best-effort: si falla, seguimos — el pending colgado no impide
  // crear el active nuevo (el lookup de active arriba ya pasó).
  const pending = await getPendingExamPassForUser(input.userId, input.orgId)
  if (pending) {
    await cancelPendingPass({
      passId: pending.id,
      reason: "user_paid_in_store",
    }).catch((err) => {
      console.warn(
        "[exam-pass/grantInStore] cancelPendingPass falló, sigo:",
        err,
      )
    })
  }

  const counterRef = adminDb.collection(COLL_COUNTERS).doc(input.orgId)
  const newPassRef = adminDb.collection(COLL_PASSES).doc()

  return await adminDb.runTransaction(async (tx) => {
    // Lectura del contador dentro de la tx → precio fresco y consistente.
    const counterSnap = await tx.get(counterRef)
    const soldCount = counterSnap.exists
      ? Number(counterSnap.data()?.count ?? 0)
      : 0
    const price = priceForSoldCount(soldCount)

    const now = new Date()
    const nowIso = now.toISOString()
    const expiresAtIso = computeExpiresAt(now).toISOString()

    const pass: ExamPass = {
      id: newPassRef.id,
      orgId: input.orgId,
      userId: input.userId,
      status: "active",
      purchasePrice: price,
      creditsTotal: EXAM_PASS_RULES.CREDITS_TOTAL,
      creditsUsed: 0,
      creditsReserved: 0,
      purchasedAt: nowIso,
      expiresAt: expiresAtIso,
      paymentIntentId: null,
      lastUsedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      purchaseSource: "in_store",
      paymentMethod: input.paymentMethod,
      grantedByStaffId: input.grantedByStaffId,
      ...(input.note ? { grantedByNote: input.note } : {}),
    }

    tx.set(newPassRef, pass)
    tx.set(
      counterRef,
      {
        orgId: input.orgId,
        count: FieldValue.increment(1),
        updatedAt: nowIso,
      },
      { merge: true },
    )

    const quote: ExamPassQuote = {
      orgId: input.orgId,
      price,
      priceCents: price * 100,
      currency: "EUR",
      soldCount: soldCount + 1,
      earlyBirdRemaining: Math.max(
        0,
        EXAM_PASS_PRICING.EARLY_BIRD_LIMIT - (soldCount + 1),
      ),
    }

    return { ok: true, pass, quote }
  })
}

// ── 4) getActiveExamPassForUser ───────────────────────────────────

/**
 * Devuelve el bono activo del usuario en esta org, o null si no tiene.
 * Hace self-heal: si Firestore tiene un pass `active` cuya `expiresAt` ya
 * pasó, lo flippea a `expired` y devuelve null.
 *
 * Asunción: un usuario suele tener como mucho 1 bono activo a la vez. Si
 * tuviera varios (compró otro antes de gastar el primero), devolvemos
 * cualquiera vivo; la UI no debería permitir comprar un segundo si ya hay uno
 * activo (regla de Fase 3B/UI).
 */
export async function getActiveExamPassForUser(
  userId: string,
  orgId: string,
): Promise<ExamPass | null> {
  const snap = await adminDb.collection(COLL_PASSES)
    .where("userId", "==", userId)
    .where("orgId", "==", orgId)
    .where("status", "==", "active")
    .limit(1)
    .get()
  if (snap.empty) return null

  const doc = snap.docs[0]
  const pass = { id: doc.id, ...doc.data() } as ExamPass
  const now = new Date()
  if (!isPassActive(pass, now)) {
    // Best-effort self-heal; ignoramos errores para no bloquear la lectura.
    await doc.ref.update({
      status: "expired",
      updatedAt: now.toISOString(),
    }).catch(() => undefined)
    return null
  }
  return pass
}

// ── 5) reserveRedemption ──────────────────────────────────────────

export interface ReserveRedemptionInput {
  userId: string
  orgId: string
  input: ExamPassOrderInput
  /** Override solo para tests; en producción dejar undefined. */
  now?: Date
}

export type ReserveRedemptionResult =
  | {
      ok: true
      redemption: ExamPassRedemption
      pass: ExamPass
    }
  | {
      ok: false
      error: "INVALID_ORDER" | "ELIGIBILITY"
      orderError?: string
      eligibility?: RedemptionEligibility
    }

/**
 * Reserva 1 crédito para un canje futuro.
 *
 * Flujo atómico:
 * 1. Validar orden con `computeOrder` (puro, fuera de tx).
 * 2. tx: leer pass activo.
 * 3. tx: comprobar elegibilidad (créditos disponibles, expiry).
 * 4. tx: crear doc `exam_pass_redemptions` con status="reserved" e
 *        idempotencyKey, e incrementar `creditsReserved` en el pass.
 *
 * Si Stripe se cae justo después, el endpoint debe llamar a
 * `releaseRedemption` para devolver el crédito al pool.
 */
export async function reserveRedemption(input: ReserveRedemptionInput): Promise<ReserveRedemptionResult> {
  const now = input.now ?? new Date()
  const dayKey = dayKeyMadrid(now)

  // Validación pura (fuera de tx, no necesita Firestore).
  const validation = computeOrder(input.input)
  if (!validation.ok) {
    return { ok: false, error: "INVALID_ORDER", orderError: validation.error }
  }
  const quote = validation.quote

  return await adminDb.runTransaction(async (tx) => {
    // Bono activo (lectura dentro de tx para evitar carrera con activación).
    const passQuery = adminDb.collection(COLL_PASSES)
      .where("userId", "==", input.userId)
      .where("orgId", "==", input.orgId)
      .where("status", "==", "active")
      .limit(1)
    const passSnap = await tx.get(passQuery)

    if (passSnap.empty) {
      return {
        ok: false as const,
        error: "ELIGIBILITY" as const,
        eligibility: eligibilityForReservation({ pass: null, now }),
      }
    }

    const passDoc = passSnap.docs[0]
    const pass = { id: passDoc.id, ...passDoc.data() } as ExamPass

    const eligibility = eligibilityForReservation({ pass, now })
    if (!eligibility.ok) {
      return { ok: false as const, error: "ELIGIBILITY" as const, eligibility }
    }

    // Crear el doc de canje.
    const redRef = adminDb.collection(COLL_REDEMPTIONS).doc()
    const idempotencyKey = `${pass.id}:${redRef.id}`
    const redemption: ExamPassRedemption = {
      id: redRef.id,
      passId: pass.id,
      userId: input.userId,
      orgId: input.orgId,
      orderId: null,
      status: "reserved",
      productId: quote.productId,
      productName: quote.productName,
      milkId: quote.milkId,
      extras: quote.extras,
      pastryId: quote.pastryId,
      basePremiumSupplement: quote.basePremiumSupplement,
      milkSupplement: quote.milkSupplement,
      extrasSupplement: quote.extrasSupplement,
      pastrySupplement: quote.pastrySupplement,
      totalSupplement: quote.totalSupplement,
      reservedAt: now.toISOString(),
      consumedAt: null,
      releasedAt: null,
      releasedReason: null,
      paymentIntentId: null,
      idempotencyKey,
      redemptionDayKey: dayKey,
      createdAt: now.toISOString(),
    }
    tx.set(redRef, redemption)

    // Subir creditsReserved en el pass (atómico).
    tx.update(passDoc.ref, {
      creditsReserved: FieldValue.increment(1),
      updatedAt: now.toISOString(),
    })

    return {
      ok: true as const,
      redemption,
      pass: {
        ...pass,
        creditsReserved: pass.creditsReserved + 1,
      },
    }
  })
}

// ── 6) consumeRedemption ──────────────────────────────────────────

export interface ConsumeRedemptionInput {
  redemptionId: string
  /** Order vinculada (cuando exista). */
  orderId?: string
  /** Útil para audit / idempotencia frente a webhooks. */
  paymentIntentId?: string
  now?: Date
}

export type ConsumeRedemptionResult =
  | {
      ok: true
      redemption: ExamPassRedemption
      pass: ExamPass
      alreadyConsumed?: boolean
    }
  | {
      ok: false
      error: "REDEMPTION_NOT_FOUND" | "INVALID_STATE" | "PASS_NOT_FOUND"
    }

/**
 * Consuma un crédito reservado. Llamar SOLO cuando el pago del suplemento
 * esté confirmado, o (si suplemento = 0 €) inmediatamente al confirmar la
 * orden.
 *
 * Transición reserved → consumed:
 * - creditsReserved -= 1
 * - creditsUsed += 1
 * - si creditsUsed == creditsTotal → status del pass pasa a "completed"
 *
 * Idempotente: si la redemption ya está `consumed`, devuelve ok sin tocar nada.
 */
export async function consumeRedemption(input: ConsumeRedemptionInput): Promise<ConsumeRedemptionResult> {
  const now = input.now ?? new Date()
  const redRef = adminDb.collection(COLL_REDEMPTIONS).doc(input.redemptionId)

  return await adminDb.runTransaction(async (tx) => {
    const redSnap = await tx.get(redRef)
    if (!redSnap.exists) return { ok: false as const, error: "REDEMPTION_NOT_FOUND" as const }
    const red = { id: redRef.id, ...redSnap.data() } as ExamPassRedemption

    if (red.status === "consumed") {
      return { ok: true as const, redemption: red, pass: null as unknown as ExamPass, alreadyConsumed: true }
    }
    if (red.status !== "reserved") {
      return { ok: false as const, error: "INVALID_STATE" as const }
    }

    const passRef = adminDb.collection(COLL_PASSES).doc(red.passId)
    const passSnap = await tx.get(passRef)
    if (!passSnap.exists) return { ok: false as const, error: "PASS_NOT_FOUND" as const }
    const pass = { id: passRef.id, ...passSnap.data() } as ExamPass

    const newUsed = pass.creditsUsed + 1
    const willComplete = newUsed >= pass.creditsTotal

    const redUpdates: Partial<ExamPassRedemption> = {
      status: "consumed",
      consumedAt: now.toISOString(),
    }
    if (input.orderId) redUpdates.orderId = input.orderId
    if (input.paymentIntentId) redUpdates.paymentIntentId = input.paymentIntentId
    tx.update(redRef, redUpdates)

    const passUpdates: Record<string, unknown> = {
      creditsUsed: FieldValue.increment(1),
      creditsReserved: FieldValue.increment(-1),
      lastUsedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    if (willComplete) passUpdates.status = "completed"
    tx.update(passRef, passUpdates)

    return {
      ok: true as const,
      redemption: { ...red, ...redUpdates } as ExamPassRedemption,
      pass: {
        ...pass,
        creditsUsed: newUsed,
        creditsReserved: Math.max(0, pass.creditsReserved - 1),
        lastUsedAt: now.toISOString(),
        status: willComplete ? "completed" : pass.status,
      },
    }
  })
}

// ── 7) releaseRedemption ──────────────────────────────────────────

export interface ReleaseRedemptionInput {
  redemptionId: string
  reason: string
  now?: Date
}

export type ReleaseRedemptionResult =
  | { ok: true; alreadyReleased?: boolean }
  | { ok: false; error: "REDEMPTION_NOT_FOUND" | "INVALID_STATE" }

/**
 * Libera un crédito reservado. Llamar cuando:
 * - El pago del suplemento falla.
 * - El usuario cancela el pedido antes de pagar.
 * - Pasa el TTL del payment intent (idealmente vía cron — Fase posterior).
 *
 * Transición reserved → released:
 * - creditsReserved -= 1 (creditsUsed sin cambio).
 *
 * Idempotente: si la redemption ya está released, ok sin tocar nada.
 * NO se permite liberar una redemption ya consumed (sería refund — caso
 * distinto).
 */
export async function releaseRedemption(input: ReleaseRedemptionInput): Promise<ReleaseRedemptionResult> {
  const now = input.now ?? new Date()
  const redRef = adminDb.collection(COLL_REDEMPTIONS).doc(input.redemptionId)

  return await adminDb.runTransaction(async (tx) => {
    const redSnap = await tx.get(redRef)
    if (!redSnap.exists) return { ok: false as const, error: "REDEMPTION_NOT_FOUND" as const }
    const red = redSnap.data() as ExamPassRedemption

    if (red.status === "released") {
      return { ok: true as const, alreadyReleased: true }
    }
    if (red.status !== "reserved") {
      return { ok: false as const, error: "INVALID_STATE" as const }
    }

    tx.update(redRef, {
      status: "released",
      releasedAt: now.toISOString(),
      releasedReason: input.reason,
    })

    const passRef = adminDb.collection(COLL_PASSES).doc(red.passId)
    tx.update(passRef, {
      creditsReserved: FieldValue.increment(-1),
      updatedAt: now.toISOString(),
    })

    return { ok: true as const }
  })
}

// ── 9) getPendingExamPassForUser ──────────────────────────────────

/**
 * Devuelve el pass más reciente del usuario con status="pending" en esta org.
 * Útil para que la UI muestre "estamos confirmando tu pago" cuando el usuario
 * acaba de comprar pero el webhook todavía no ha llegado.
 *
 * No hace orderBy para evitar índices compuestos: si por alguna razón hubiera
 * varios pending (poco probable), devuelve cualquiera. La UI puede mostrar el
 * mensaje genérico "pago en proceso" sin importar cuál.
 */
export async function getPendingExamPassForUser(
  userId: string,
  orgId: string,
): Promise<ExamPass | null> {
  const snap = await adminDb.collection(COLL_PASSES)
    .where("userId", "==", userId)
    .where("orgId", "==", orgId)
    .where("status", "==", "pending")
    .limit(1)
    .get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...doc.data() } as ExamPass
}

// ── 11) cancelPendingPass ─────────────────────────────────────────

/**
 * Marca un pass `pending` como `canceled`. Llamado por el webhook cuando
 * Stripe reporta `payment_intent.payment_failed` o `payment_intent.canceled`
 * para una compra de bono. NO toca el contador early-bird (la activación
 * nunca pasó). NO afecta a redemptions (el bono nunca tuvo créditos vivos).
 *
 * Idempotente: si ya está canceled, ok sin tocar nada. Si está active, falla
 * con INVALID_STATE — la cancelación de un bono ya activo es un refund, caso
 * distinto que no implementamos aquí.
 */
export async function cancelPendingPass(input: {
  passId: string
  reason: string
  paymentIntentId?: string
  now?: Date
}): Promise<{
  ok: boolean
  alreadyCanceled?: boolean
  error?: "PASS_NOT_FOUND" | "INVALID_STATE" | "PAYMENT_INTENT_MISMATCH"
}> {
  const now = input.now ?? new Date()
  const ref = adminDb.collection(COLL_PASSES).doc(input.passId)
  return await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { ok: false, error: "PASS_NOT_FOUND" as const }
    const pass = snap.data() as ExamPass

    if (pass.status === "canceled") {
      return { ok: true, alreadyCanceled: true }
    }
    if (pass.status !== "pending") {
      return { ok: false, error: "INVALID_STATE" as const }
    }
    if (
      input.paymentIntentId &&
      pass.paymentIntentId &&
      pass.paymentIntentId !== input.paymentIntentId
    ) {
      return { ok: false, error: "PAYMENT_INTENT_MISMATCH" as const }
    }

    tx.update(ref, {
      status: "canceled",
      updatedAt: now.toISOString(),
    })
    return { ok: true }
  })
}

// ── 12) getCustomerExamPassStatus ────────────────────────────────

export interface CustomerExamPassStatus {
  state: "active" | "pending" | "none"
  pass: ExamPass | null
  creditsAvailable: number
}

/**
 * Estado del bono de un cliente — usado por el POS antes de canjear.
 * El barista debe ver de un vistazo si el cliente tiene bono y cuántos
 * créditos le quedan.
 *
 * No es lo mismo que `/me`: éste recibe un userId arbitrario (el del cliente)
 * y se llama desde un endpoint admin protegido por staff.
 */
export async function getCustomerExamPassStatus(
  userId: string,
  orgId: string,
): Promise<CustomerExamPassStatus> {
  const active = await getActiveExamPassForUser(userId, orgId)
  if (active) {
    return {
      state: "active",
      pass: active,
      creditsAvailable: creditsAvailable(active),
    }
  }

  const pending = await getPendingExamPassForUser(userId, orgId)
  if (pending) {
    return {
      state: "pending",
      pass: pending,
      creditsAvailable: 0,
    }
  }

  return {
    state: "none",
    pass: null,
    creditsAvailable: 0,
  }
}

// ── 13) redeemExamPassInStore ────────────────────────────────────

export interface RedeemInStoreInput {
  orgId: string
  userId: string
  input: ExamPassOrderInput
  /**
   * Opcional. Solo lo establece el POS cuando el barista cobra en barra.
   * Cuando el canje viene desde la app del cliente, se omite (el cobro
   * ocurrirá después en barra y el POS lo registrará al servir).
   */
  paymentMethod?: "cash" | "card_terminal"
  /** UID del barista (caller staff). Trazabilidad. Solo en canjes POS. */
  staffId?: string
  /** Nota libre opcional ("para llevar", "promo", etc.). */
  note?: string
  /**
   * Origen del canje. Útil para auditar y para que el POS distinga canjes
   * iniciados desde la app del cliente (PENDIENTE de cobro) de canjes en
   * barra (ya cobrados).
   */
  source?: "app" | "pos"
  now?: Date
}

export type RedeemInStoreResult =
  | {
      ok: true
      redemption: ExamPassRedemption
      pass: ExamPass
      quote: ExamPassOrderQuote
    }
  | {
      ok: false
      error: "INVALID_ORDER" | "ELIGIBILITY"
      orderError?: string
      eligibility?: RedemptionEligibility
    }

/**
 * Canje desde el POS: el barista cobra suplementos en barra (datáfono o
 * efectivo), sirve el café, y consumimos 1 crédito del bono. Síncrono — no
 * hay reserva separada porque el "pago" ocurre fuera de Stripe.
 *
 * Reutiliza `reserveRedemption` y `consumeRedemption` para mantener la
 * lógica de elegibilidad y idempotencia centralizada. La ventana entre
 * reserve y consume es mínima (server-to-server admin), pero ante un fallo
 * raro liberamos la reserva para no dejar el crédito colgado.
 *
 * Tras consumir, hace un update extra al doc de la redemption para guardar
 * trazabilidad del POS (`paymentMethod`, `staffId`, `note`). Esos campos
 * son *additivos* — el shape principal de `ExamPassRedemption` no cambia.
 */
export async function redeemExamPassInStore(
  input: RedeemInStoreInput,
): Promise<RedeemInStoreResult> {
  const reserveResult = await reserveRedemption({
    userId: input.userId,
    orgId: input.orgId,
    input: input.input,
    now: input.now,
  })
  if (!reserveResult.ok) {
    // Mismo shape que el flujo app — el endpoint los traduce a HTTP.
    return reserveResult
  }

  const { redemption, pass } = reserveResult

  // Calcular el quote para devolverlo (computeOrder vuelve a correr aquí
  // pero es puro; aceptable para mantener contratos limpios).
  const validation = computeOrder(input.input)
  if (!validation.ok) {
    // Inconsistencia: reserve pasó pero compute falla. Liberar y rendirse.
    await releaseRedemption({
      redemptionId: redemption.id,
      reason: "in_store_validate_inconsistency",
    }).catch(() => undefined)
    return { ok: false, error: "INVALID_ORDER", orderError: validation.error }
  }

  const consumeResult = await consumeRedemption({
    redemptionId: redemption.id,
    // No hay paymentIntentId — el pago fue físico.
    now: input.now,
  })

  if (!consumeResult.ok) {
    // Liberar la reserva para no dejar crédito huérfano.
    await releaseRedemption({
      redemptionId: redemption.id,
      reason: "in_store_consume_failed",
    }).catch(() => undefined)
    return {
      ok: false,
      error: "INVALID_ORDER",
      orderError: consumeResult.error,
    }
  }

  // Trazabilidad — additivo sobre el doc redemption. Solo guardamos los
  // campos POS si el caller los proveyó (canje en barra). Para canjes app
  // se omiten; el cobro lo registrará el POS al servir.
  const traceUpdate: Record<string, unknown> = {}
  if (input.source) traceUpdate.source = input.source
  if (input.paymentMethod) traceUpdate.inStorePaymentMethod = input.paymentMethod
  if (input.staffId) traceUpdate.inStoreStaffId = input.staffId
  if (input.note && input.note.trim()) {
    traceUpdate.inStoreNote = input.note.trim()
  }
  // Si no hay nada que trazar, saltamos el update.
  if (Object.keys(traceUpdate).length === 0) {
    return {
      ok: true,
      redemption: consumeResult.redemption,
      pass: consumeResult.pass,
      quote: validation.quote,
    }
  }
  await adminDb
    .collection(COLL_REDEMPTIONS)
    .doc(redemption.id)
    .update(traceUpdate)
    .catch((err) => {
      // No bloquea: el canje ya está consumed. Solo perdemos el campo de
      // trazabilidad. Loguear y seguir.
      console.warn(
        "[exam-pass/redeemInStore] update trace falló:",
        err,
      )
    })

  return {
    ok: true,
    redemption: consumeResult.redemption,
    pass: consumeResult.pass,
    quote: validation.quote,
  }
}

// ── 14) listActiveExamPasses ─────────────────────────────────────

/**
 * Devuelve todos los bonos `active` de una org. Usado por la sección
 * "Clientes" del control tower de Brain para mostrar quién tiene bono.
 *
 * No paginamos: en v1 esperamos < 1000 bonos activos por org. Si crece,
 * añadir cursor-based pagination o batching por chunks.
 */
export async function listActiveExamPasses(
  orgId: string,
  maxResults = 1000,
): Promise<ExamPass[]> {
  const snap = await adminDb
    .collection(COLL_PASSES)
    .where("orgId", "==", orgId)
    .where("status", "==", "active")
    .limit(maxResults)
    .get()
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ExamPass, "id">), id: d.id }))
}
