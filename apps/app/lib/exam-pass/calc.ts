/**
 * Bono Supervivencia Exámenes — lógica pura de cálculo.
 *
 * MUST MIRROR: apps/brain/lib/exam-pass/calc.ts
 * Cualquier cambio aquí debe replicarse byte-a-byte en el archivo gemelo.
 * Si un día crece la complejidad, mover a packages/shared/exam-pass/.
 *
 * 100% pura: sin acceso a Firestore, sin Date.now(), sin I/O. Toda fecha entra
 * como parámetro `now` para que el cliente y el servidor produzcan el mismo
 * resultado y para que sea trivialmente testable.
 *
 * Convención monetaria: € en `number`. Toda suma se redondea a 2 decimales con
 * `roundEuros` para evitar que la aritmética flotante haga aparecer
 * 1.7000000000000002.
 */

import {
  EXAM_PASS_PRICING,
  EXAM_PASS_RULES,
  findExtra,
  findMilk,
  findPastry,
  findPremiumProduct,
  findProduct,
  productHasMilk,
  productIsIced,
} from "./config"
import type {
  ExamPass,
  ExamPassOrderInput,
  ExamPassOrderQuote,
  OrderValidationResult,
  RedemptionEligibility,
} from "./types"

// ── Money ─────────────────────────────────────────────────────────

/** Redondea a 2 decimales evitando ruido binario (0.1 + 0.2 → 0.3). */
export function roundEuros(value: number): number {
  return Math.round(value * 100) / 100
}

// ── Pricing ───────────────────────────────────────────────────────

/**
 * Precio que paga el siguiente comprador, dado cuántos bonos ya están vendidos.
 * "Vendidos" significa con pago confirmado (status active/expired/completed/refunded);
 * los `pending` no cuentan.
 */
export function priceForSoldCount(soldCount: number): 20 | 22 {
  return soldCount < EXAM_PASS_PRICING.EARLY_BIRD_LIMIT
    ? EXAM_PASS_PRICING.EARLY_BIRD_PRICE
    : EXAM_PASS_PRICING.STANDARD_PRICE
}

// ── Expiry ────────────────────────────────────────────────────────

/** ISO de expiración: activatedAt + VALIDITY_DAYS. */
export function computeExpiresAt(activatedAt: Date): Date {
  const out = new Date(activatedAt)
  out.setUTCDate(out.getUTCDate() + EXAM_PASS_RULES.VALIDITY_DAYS)
  return out
}

// ── Day key (Madrid TZ) ───────────────────────────────────────────

/**
 * Devuelve "YYYY-MM-DD" en zona Europe/Madrid para `date`.
 * Cambio de día = 00:00 hora de Madrid (no rolling 24h).
 */
export function dayKeyMadrid(date: Date): string {
  // Intl.DateTimeFormat con timeZone garantiza el cálculo correcto incluso en
  // cambios de hora (DST). Devuelve partes en orden conocido.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: EXAM_PASS_RULES.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  // "en-CA" produce "YYYY-MM-DD" directamente.
  return fmt.format(date)
}

// ── Pass state ────────────────────────────────────────────────────

/**
 * Créditos que el usuario puede usar AHORA (no reservados, no consumidos).
 * Nota: `creditsUsed + creditsReserved` nunca debería exceder `creditsTotal`;
 * si por una carrera puntual lo hiciera, devolvemos 0.
 */
export function creditsAvailable(pass: Pick<ExamPass, "creditsTotal" | "creditsUsed" | "creditsReserved">): number {
  const free = pass.creditsTotal - pass.creditsUsed - pass.creditsReserved
  return free > 0 ? free : 0
}

/**
 * ¿Está el bono vivo y útil ahora mismo?
 * No comprueba créditos — para eso usar `eligibilityForReservation`.
 */
export function isPassActive(pass: ExamPass, now: Date): boolean {
  if (pass.status !== "active") return false
  if (!pass.expiresAt) return false
  return new Date(pass.expiresAt).getTime() > now.getTime()
}

// ── Eligibility para RESERVAR un crédito ─────────────────────────

interface EligibilityInput {
  pass: ExamPass | null
  now: Date
}

/**
 * Decide si se puede reservar 1 crédito del bono ahora.
 * Idempotente y puro. La transición efectiva (escribir Firestore) la hace el
 * servidor en una transacción aparte usando este resultado como guard.
 */
export function eligibilityForReservation(input: EligibilityInput): RedemptionEligibility {
  const { pass, now } = input

  if (!pass) {
    return {
      ok: false,
      reason: "PASS_NOT_FOUND",
      creditsAvailable: 0,
      expiresAt: null,
    }
  }

  if (pass.status === "pending") {
    return {
      ok: false,
      reason: "PASS_PENDING_PAYMENT",
      creditsAvailable: 0,
      expiresAt: pass.expiresAt,
    }
  }

  if (pass.status !== "active") {
    return {
      ok: false,
      reason: "PASS_NOT_ACTIVE",
      creditsAvailable: creditsAvailable(pass),
      expiresAt: pass.expiresAt,
    }
  }

  if (!pass.expiresAt || new Date(pass.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "PASS_EXPIRED",
      creditsAvailable: creditsAvailable(pass),
      expiresAt: pass.expiresAt,
    }
  }

  const free = creditsAvailable(pass)
  if (free <= 0) {
    return {
      ok: false,
      reason: "NO_CREDITS",
      creditsAvailable: 0,
      expiresAt: pass.expiresAt,
    }
  }

  return {
    ok: true,
    creditsAvailable: free,
    expiresAt: pass.expiresAt,
  }
}

// ── Compute order (validación + breakdown) ───────────────────────

/**
 * Valida la combinación elegida por el usuario y devuelve el desglose.
 * Reglas (rechaza si las viola):
 * - productId debe existir.
 * - milkId solo si la bebida tiene leche; ausente o null si no la tiene.
 * - extras: solo IDs válidos; "iced_version" rechazado si la bebida ya es iced.
 * - pastryId: solo IDs válidos.
 * Si todo cuadra, devuelve un quote con `creditsUsed: 1`.
 */
export function computeOrder(input: ExamPassOrderInput): OrderValidationResult {
  const product = findProduct(input.productId)
  if (!product) {
    return { ok: false, error: "PRODUCT_NOT_FOUND" }
  }

  // Leche
  const wantsMilk = input.milkId != null
  const productNeedsMilk = product.hasMilk
  let milkSupplement = 0

  if (wantsMilk && !productNeedsMilk) {
    return { ok: false, error: "MILK_NOT_ALLOWED_FOR_PRODUCT" }
  }
  if (wantsMilk) {
    const milk = findMilk(input.milkId as string)
    if (!milk) return { ok: false, error: "MILK_INVALID" }
    milkSupplement = milk.supplement
  }

  // Extras
  const extras = input.extras ?? []
  let extrasSupplement = 0
  const seenExtras = new Set<string>()
  for (const id of extras) {
    if (seenExtras.has(id)) continue // dedup defensivo
    seenExtras.add(id)
    const extra = findExtra(id)
    if (!extra) return { ok: false, error: "EXTRA_INVALID" }
    if (id === "iced_version" && productIsIced(input.productId)) {
      return { ok: false, error: "EXTRA_ICED_REDUNDANT" }
    }
    extrasSupplement = roundEuros(extrasSupplement + extra.supplement)
  }

  // Repostería
  let pastrySupplement = 0
  if (input.pastryId) {
    const pastry = findPastry(input.pastryId)
    if (!pastry) return { ok: false, error: "PASTRY_INVALID" }
    pastrySupplement = pastry.bonoPrice
  }

  // Premium base
  const premium = findPremiumProduct(input.productId)
  const basePremiumSupplement = premium?.supplement ?? 0

  const total = roundEuros(
    basePremiumSupplement + milkSupplement + extrasSupplement + pastrySupplement,
  )

  const quote: ExamPassOrderQuote = {
    productId: input.productId,
    productName: product.name,
    productNameEn: product.nameEn,
    isPremium: !!premium,
    milkId: wantsMilk ? (input.milkId as ExamPassOrderQuote["milkId"]) : null,
    extras: Array.from(seenExtras) as ExamPassOrderQuote["extras"],
    pastryId: input.pastryId ?? null,
    basePremiumSupplement: roundEuros(basePremiumSupplement),
    milkSupplement: roundEuros(milkSupplement),
    extrasSupplement: roundEuros(extrasSupplement),
    pastrySupplement: roundEuros(pastrySupplement),
    totalSupplement: total,
    creditsUsed: 1,
  }

  return { ok: true, quote }
}

// ── Re-exports útiles ────────────────────────────────────────────

export { productHasMilk, productIsIced }
