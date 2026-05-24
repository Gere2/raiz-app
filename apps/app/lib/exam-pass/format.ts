/**
 * Bono Supervivencia Exámenes — helpers de formato para UI.
 *
 * REGLA UX CRÍTICA — ningún componente debería construir a mano un label como
 * "+0,50 €" para una bebida o suplemento dentro del bono. La premium siempre
 * se muestra como "Usa 1 crédito + 0,50 €". Estos helpers son la única vía
 * permitida para producir esos textos: mantienen la consistencia.
 */

import {
  findExtra,
  findMilk,
  findPastry,
  findPremiumProduct,
  findProduct,
} from "./config"
import type { ExamPassOrderQuote, Locale, MilkId, PastryId } from "./types"

// ── Currency ──────────────────────────────────────────────────────

const CURRENCY_LOCALE: Record<Locale, string> = {
  es: "es-ES",
  en: "en-IE", // EUR locale en inglés (Irlanda) → "€0.50"
}

/**
 * Formatea un importe en € respetando el locale. No fuerza signo:
 * `formatEuros(0.5)` → "0,50 €" (es) o "€0.50" (en).
 */
export function formatEuros(value: number, locale: Locale = "es"): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** "+0,50 €" — añade el signo. Para sumar al usuario en líneas de pedido. */
export function formatPlusEuros(value: number, locale: Locale = "es"): string {
  if (value <= 0) return formatIncluded(locale)
  return `+${formatEuros(value, locale)}`
}

// ── Etiquetas de bono ─────────────────────────────────────────────

export function formatIncluded(locale: Locale = "es"): string {
  return locale === "es" ? "Incluido" : "Included"
}

export function formatIncludedFem(locale: Locale = "es"): string {
  return locale === "es" ? "Incluida" : "Included"
}

export function formatUsesOneCredit(locale: Locale = "es"): string {
  return locale === "es" ? "Usa 1 crédito" : "Uses 1 credit"
}

/**
 * Etiqueta canónica para una bebida del bono.
 * - Sin suplemento → "Usa 1 crédito"
 * - Con suplemento → "Usa 1 crédito + 0,50 €"
 *
 * Nunca devuelve solo "+0,50 €". Esa es precisamente la confusión que evitamos.
 */
export function formatCreditPlusSupplement(supplement: number, locale: Locale = "es"): string {
  const base = formatUsesOneCredit(locale)
  if (supplement <= 0) return base
  return `${base} + ${formatEuros(supplement, locale)}`
}

/**
 * Etiqueta para una tarjeta de producto premium del catálogo del bono.
 * Wrapper sobre `formatCreditPlusSupplement` para legibilidad en la UI.
 */
export function formatPremiumProductLabel(productId: string, locale: Locale = "es"): string {
  const premium = findPremiumProduct(productId)
  if (!premium) return formatUsesOneCredit(locale)
  return formatCreditPlusSupplement(premium.supplement, locale)
}

// ── Etiquetas para opciones (leche/extra/pastry) ──────────────────

/** "Incluida" / "+0,20 €" — para la sección de leches. */
export function formatMilkLabel(milkId: MilkId, locale: Locale = "es"): string {
  const milk = findMilk(milkId)
  if (!milk) return ""
  if (milk.supplement <= 0) return formatIncludedFem(locale)
  return formatPlusEuros(milk.supplement, locale)
}

/** "+0,50 €" o "Incluido". Para extras opcionales. */
export function formatExtraLabel(extraId: string, locale: Locale = "es"): string {
  const extra = findExtra(extraId)
  if (!extra) return ""
  return formatPlusEuros(extra.supplement, locale)
}

/**
 * "+1,50 € · Antes 2,00 €" — pastry con tachado.
 * El "tachado" lo aplica visualmente la UI; este helper devuelve el componente
 * textual de "antes" para que la UI no lo invente:
 *   { label: "+1,50 €", before: "Antes 2,00 €" }
 */
export interface PastryLabel {
  label: string
  before: string
}

export function formatPastryLabel(pastryId: PastryId, locale: Locale = "es"): PastryLabel {
  const pastry = findPastry(pastryId)
  if (!pastry) return { label: "", before: "" }
  const beforeWord = locale === "es" ? "Antes" : "Was"
  return {
    label: formatPlusEuros(pastry.bonoPrice, locale),
    before: `${beforeWord} ${formatEuros(pastry.normalPrice, locale)}`,
  }
}

// ── Resumen de pedido (pantalla "Resumen") ────────────────────────

export interface OrderSummaryLine {
  label: string
  value: string
}

export interface OrderSummary {
  lines: OrderSummaryLine[]
  /** Importe que paga ahora (suplementos), formateado. */
  totalLabel: string
  /** Importe en €, sin formato (para pasar a Stripe). */
  totalValue: number
  /** "También se descontará 1 crédito de tu bono". */
  creditNote: string
}

/**
 * Construye las líneas del bloque "Resumen de tu pedido" desde un quote.
 * Devuelve siempre los textos finales — la UI solo los pinta.
 *
 * `creditsRemainingAfter` es opcional; si se pasa, no se usa aquí (se muestra
 * fuera con `formatRemainingCredits`).
 */
export function buildOrderSummary(
  quote: ExamPassOrderQuote,
  locale: Locale = "es",
): OrderSummary {
  const lines: OrderSummaryLine[] = []
  const t = locale === "es"
    ? {
        bebida: "Bebida",
        bono: "Bono",
        leche: "Leche",
        extra: "Extra",
        dulce: "Dulce",
        usaCredito: "usa 1 crédito",
        creditNote: "También se descontará 1 crédito de tu bono",
      }
    : {
        bebida: "Drink",
        bono: "Pass",
        leche: "Milk",
        extra: "Extra",
        dulce: "Pastry",
        usaCredito: "uses 1 credit",
        creditNote: "1 credit will also be deducted from your pass",
      }

  // Bebida
  lines.push({
    label: t.bebida,
    value: locale === "es" ? quote.productName : quote.productNameEn,
  })

  // Bono (siempre presente)
  const bonoValue = quote.basePremiumSupplement > 0
    ? `${t.usaCredito} + ${formatEuros(quote.basePremiumSupplement, locale)}`
    : t.usaCredito
  lines.push({ label: t.bono, value: bonoValue })

  // Leche (solo si hay)
  if (quote.milkId) {
    const milkDef = findMilk(quote.milkId)
    if (milkDef) {
      const milkName = locale === "es" ? milkDef.name : milkDef.nameEn
      const milkSupp = quote.milkSupplement > 0
        ? ` ${formatPlusEuros(quote.milkSupplement, locale)}`
        : ""
      lines.push({ label: t.leche, value: `${milkName}${milkSupp}` })
    }
  }

  // Extras
  for (const extraId of quote.extras) {
    const ex = findExtra(extraId)
    if (!ex) continue
    const name = locale === "es" ? ex.name : ex.nameEn
    lines.push({
      label: t.extra,
      value: `${name} ${formatPlusEuros(ex.supplement, locale)}`,
    })
  }

  // Repostería
  if (quote.pastryId) {
    const pastry = findPastry(quote.pastryId)
    if (pastry) {
      const name = locale === "es" ? pastry.name : pastry.nameEn
      lines.push({
        label: t.dulce,
        value: `${name} ${formatPlusEuros(pastry.bonoPrice, locale)}`,
      })
    }
  }

  return {
    lines,
    totalLabel: formatEuros(quote.totalSupplement, locale),
    totalValue: quote.totalSupplement,
    creditNote: t.creditNote,
  }
}

// ── Estados de bono ───────────────────────────────────────────────

/** "Te quedan 7 de 10 cafés" */
export function formatRemainingCredits(
  used: number,
  total: number,
  locale: Locale = "es",
): string {
  const remaining = Math.max(0, total - used)
  return locale === "es"
    ? `Te quedan ${remaining} de ${total} cafés`
    : `${remaining} of ${total} coffees left`
}

/**
 * "Te quedarán 7 de 10 cafés" — variante futura, para el resumen previo.
 * Útil cuando aún no se ha consumido el crédito pero se va a consumir.
 */
export function formatRemainingCreditsAfter(
  usedAfter: number,
  total: number,
  locale: Locale = "es",
): string {
  const remaining = Math.max(0, total - usedAfter)
  return locale === "es"
    ? `Te quedarán ${remaining} de ${total} cafés`
    : `${remaining} of ${total} coffees will remain`
}

/** Mensajes para errores de elegibilidad. */
export function formatEligibilityMessage(
  reason:
    | "PASS_NOT_FOUND"
    | "PASS_PENDING_PAYMENT"
    | "PASS_NOT_ACTIVE"
    | "PASS_EXPIRED"
    | "NO_CREDITS",
  locale: Locale = "es",
): string {
  const es: Record<typeof reason, string> = {
    PASS_NOT_FOUND: "No tienes un bono activo.",
    PASS_PENDING_PAYMENT: "Estamos confirmando tu pago. Espera unos segundos.",
    PASS_NOT_ACTIVE: "Tu bono no está activo.",
    PASS_EXPIRED: "Tu bono ha caducado. Compra otro para seguir.",
    NO_CREDITS: "Has usado los 10 cafés de tu bono. Compra otro para seguir.",
  }
  const en: Record<typeof reason, string> = {
    PASS_NOT_FOUND: "You don't have an active pass.",
    PASS_PENDING_PAYMENT: "We're confirming your payment. Hang on a second.",
    PASS_NOT_ACTIVE: "Your pass isn't active.",
    PASS_EXPIRED: "Your pass has expired. Buy a new one to keep going.",
    NO_CREDITS: "You've used all 10 coffees on your pass. Buy a new one to keep going.",
  }
  return locale === "es" ? es[reason] : en[reason]
}

// ── Producto: nombre localizado ───────────────────────────────────

export function localizedProductName(productId: string, locale: Locale = "es"): string {
  const p = findProduct(productId)
  if (!p) return productId
  return locale === "es" ? p.name : p.nameEn
}
