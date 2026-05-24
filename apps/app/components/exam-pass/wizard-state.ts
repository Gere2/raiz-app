/**
 * Wizard state ↔ query string.
 *
 * El wizard guarda la selección del usuario en la URL para que refresh y
 * back/forward funcionen sin sorpresas. Este módulo es la única vía permitida
 * para leer/escribir esa serialización.
 *
 * Esquema:
 *   ?step=drink|milk|extras|pastry
 *   &p=<productId>
 *   &m=<milkId>
 *   &e=<extraId>(,<extraId>)*
 *   &d=<pastryId>
 *
 * IDs desconocidos se descartan silenciosamente — la página /resumen luego
 * pasa lo que quede a `computeOrder` que rechaza combinaciones inválidas.
 */

import {
  EXTRAS_OPTIONS,
  INCLUDED_PRODUCTS,
  MILK_OPTIONS,
  PASTRY_OPTIONS,
  PREMIUM_PRODUCTS,
  productHasMilk,
  productIsIced,
  type ExtraId,
  type MilkId,
  type PastryId,
  type ProductId,
} from "@/lib/exam-pass"

export type WizardStep = "drink" | "milk" | "extras" | "pastry"

export interface Selection {
  productId?: ProductId
  milkId?: MilkId
  extras: ExtraId[]
  pastryId?: PastryId
}

const PRODUCT_IDS = new Set<string>([
  ...INCLUDED_PRODUCTS.map((p) => p.id),
  ...PREMIUM_PRODUCTS.map((p) => p.id),
])
const MILK_IDS = new Set<string>(MILK_OPTIONS.map((m) => m.id))
const EXTRA_IDS = new Set<string>(EXTRAS_OPTIONS.map((e) => e.id))
const PASTRY_IDS = new Set<string>(PASTRY_OPTIONS.map((p) => p.id))

/** Lee selección + step desde URLSearchParams. Tolera IDs desconocidos. */
export function readSelection(params: URLSearchParams): Selection {
  const productId = params.get("p")
  const milkId = params.get("m")
  const extras = (params.get("e") ?? "").split(",").filter(Boolean)
  const pastryId = params.get("d")

  return {
    productId: productId && PRODUCT_IDS.has(productId) ? (productId as ProductId) : undefined,
    milkId: milkId && MILK_IDS.has(milkId) ? (milkId as MilkId) : undefined,
    extras: extras.filter((id) => EXTRA_IDS.has(id)) as ExtraId[],
    pastryId: pastryId && PASTRY_IDS.has(pastryId) ? (pastryId as PastryId) : undefined,
  }
}

export function readStep(params: URLSearchParams): WizardStep {
  const s = params.get("step")
  if (s === "milk" || s === "extras" || s === "pastry") return s
  return "drink"
}

/** Construye query string canónica. Omite campos vacíos para mantenerla corta. */
export function buildQueryString(sel: Selection, step?: WizardStep): string {
  const parts: string[] = []
  if (step) parts.push(`step=${step}`)
  if (sel.productId) parts.push(`p=${encodeURIComponent(sel.productId)}`)
  if (sel.milkId) parts.push(`m=${encodeURIComponent(sel.milkId)}`)
  if (sel.extras.length > 0)
    parts.push(`e=${encodeURIComponent(sel.extras.join(","))}`)
  if (sel.pastryId) parts.push(`d=${encodeURIComponent(sel.pastryId)}`)
  return parts.length ? `?${parts.join("&")}` : ""
}

// ── Navegación entre pasos ────────────────────────────────────────

/**
 * Determina el siguiente paso. Si la bebida no lleva leche, salta `milk`.
 * Devuelve `null` cuando ya estás en el último paso (toca ir al resumen).
 */
export function nextStep(current: WizardStep, sel: Selection): WizardStep | null {
  if (current === "drink") {
    if (!sel.productId) return null
    return productHasMilk(sel.productId) ? "milk" : "extras"
  }
  if (current === "milk") return "extras"
  if (current === "extras") return "pastry"
  return null // pastry es el último; "siguiente" → resumen
}

/** Paso anterior, respetando si el usuario saltó `milk`. */
export function prevStep(current: WizardStep, sel: Selection): WizardStep | null {
  if (current === "drink") return null
  if (current === "milk") return "drink"
  if (current === "extras")
    return sel.productId && productHasMilk(sel.productId) ? "milk" : "drink"
  if (current === "pastry") return "extras"
  return null
}

/** Total de pasos (para el indicador "Paso X de Y"). */
export function totalSteps(sel: Selection): number {
  return sel.productId && productHasMilk(sel.productId) ? 4 : 3
}

/** Posición del paso actual (1-based). Tiene en cuenta si se salta `milk`. */
export function stepNumber(current: WizardStep, sel: Selection): number {
  if (current === "drink") return 1
  const hasMilk = sel.productId ? productHasMilk(sel.productId) : false
  if (current === "milk") return 2
  if (current === "extras") return hasMilk ? 3 : 2
  return hasMilk ? 4 : 3 // pastry
}

// ── Filtros de catálogo según selección ──────────────────────────

/**
 * Devuelve los extras a mostrar en el paso de extras, ocultando "iced_version"
 * cuando la bebida ya es iced (regla del spec).
 */
export function visibleExtras(sel: Selection) {
  const productAlreadyIced = sel.productId
    ? productIsIced(sel.productId)
    : false
  return EXTRAS_OPTIONS.filter(
    (e) => !(e.id === "iced_version" && productAlreadyIced),
  )
}
