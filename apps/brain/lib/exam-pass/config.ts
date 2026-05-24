/**
 * Bono Supervivencia Exámenes — catálogo y reglas (canónicas).
 *
 * MUST MIRROR: apps/app/lib/exam-pass/config.ts
 * Cualquier cambio aquí debe replicarse byte-a-byte en el archivo gemelo.
 * Si un día crece la complejidad, mover a packages/shared/exam-pass/.
 *
 * No editar precios desde UI: en v1 el catálogo es cerrado.
 */

import type {
  ExtraId,
  IncludedProductId,
  MilkId,
  PastryId,
  PremiumProductId,
} from "./types"

// ── Pricing ───────────────────────────────────────────────────────

export const EXAM_PASS_PRICING = {
  /** Primeros N bonos al precio early-bird. */
  EARLY_BIRD_LIMIT: 30,
  /** Precio en € para los primeros N bonos. */
  EARLY_BIRD_PRICE: 20,
  /** Precio en € a partir del bono N+1. */
  STANDARD_PRICE: 22,
} as const

// ── Reglas de uso ─────────────────────────────────────────────────

export const EXAM_PASS_RULES = {
  CREDITS_TOTAL: 10,
  VALIDITY_DAYS: 60,
  /** Zona del day-key con que se sella cada canje. */
  TIMEZONE: "Europe/Madrid",
} as const

// ── Catálogo: bebidas incluidas (1 crédito, 0 € extra) ────────────

export interface IncludedProductDef {
  id: IncludedProductId
  name: string
  nameEn: string
  hasMilk: boolean
}

export const INCLUDED_PRODUCTS: readonly IncludedProductDef[] = [
  { id: "cafe_solo",      name: "Café solo",      nameEn: "Espresso",         hasMilk: false },
  { id: "americano",      name: "Americano",      nameEn: "Americano",        hasMilk: false },
  { id: "cortado",        name: "Cortado",        nameEn: "Cortado",          hasMilk: true  },
  { id: "cafe_con_leche", name: "Café con leche", nameEn: "Coffee with milk", hasMilk: true  },
] as const

// ── Catálogo: bebidas premium (1 crédito + suplemento) ────────────

export interface PremiumProductDef {
  id: PremiumProductId
  name: string
  nameEn: string
  /** Suplemento base en €. */
  supplement: number
  hasMilk: boolean
  /** True si el propio producto ya viene frío (impide el extra "iced_version"). */
  isIced: boolean
}

export const PREMIUM_PRODUCTS: readonly PremiumProductDef[] = [
  { id: "matcha_hot",  name: "Matcha caliente", nameEn: "Hot matcha",  supplement: 0.50, hasMilk: true,  isIced: false },
  { id: "chai_hot",    name: "Chai caliente",   nameEn: "Hot chai",    supplement: 0.50, hasMilk: true,  isIced: false },
  { id: "iced_coffee", name: "Iced coffee",     nameEn: "Iced coffee", supplement: 1.00, hasMilk: false, isIced: true  },
  { id: "iced_matcha", name: "Iced matcha",     nameEn: "Iced matcha", supplement: 1.50, hasMilk: true,  isIced: true  },
  { id: "iced_chai",   name: "Iced chai",       nameEn: "Iced chai",   supplement: 1.50, hasMilk: true,  isIced: true  },
] as const

// ── Leches ────────────────────────────────────────────────────────

export interface MilkDef {
  id: MilkId
  name: string
  nameEn: string
  /** Suplemento en € (solo cuando se canjea con bono). */
  supplement: number
}

export const MILK_OPTIONS: readonly MilkDef[] = [
  { id: "whole",        name: "Entera",      nameEn: "Whole",        supplement: 0    },
  { id: "lactose_free", name: "Sin lactosa", nameEn: "Lactose-free", supplement: 0    },
  { id: "oat",          name: "Avena",       nameEn: "Oat",          supplement: 0.20 },
  { id: "almond",       name: "Almendra",    nameEn: "Almond",       supplement: 0.20 },
] as const

// ── Extras ────────────────────────────────────────────────────────

export interface ExtraDef {
  id: ExtraId
  name: string
  nameEn: string
  supplement: number
}

export const EXTRAS_OPTIONS: readonly ExtraDef[] = [
  { id: "extra_shot",   name: "Extra shot",    nameEn: "Extra shot",   supplement: 0.50 },
  { id: "large_size",   name: "Tamaño grande", nameEn: "Large size",   supplement: 0.50 },
  { id: "iced_version", name: "Versión iced",  nameEn: "Iced version", supplement: 1.00 },
] as const

// ── Repostería con upsell ─────────────────────────────────────────

export interface PastryDef {
  id: PastryId
  name: string
  nameEn: string
  /** Precio cobrado al pedir con bono. */
  bonoPrice: number
  /** Precio normal de barra (para mostrar tachado). */
  normalPrice: number
}

export const PASTRY_OPTIONS: readonly PastryDef[] = [
  { id: "cookie", name: "Galleta",  nameEn: "Cookie", bonoPrice: 1.50, normalPrice: 2.00 },
  { id: "cake",   name: "Bizcocho", nameEn: "Cake",   bonoPrice: 2.00, normalPrice: 2.50 },
] as const

// ── Lookup helpers (puros) ────────────────────────────────────────

const INCLUDED_BY_ID = new Map<string, IncludedProductDef>(
  INCLUDED_PRODUCTS.map(p => [p.id, p]),
)
const PREMIUM_BY_ID = new Map<string, PremiumProductDef>(
  PREMIUM_PRODUCTS.map(p => [p.id, p]),
)
const MILK_BY_ID = new Map<string, MilkDef>(
  MILK_OPTIONS.map(p => [p.id, p]),
)
const EXTRA_BY_ID = new Map<string, ExtraDef>(
  EXTRAS_OPTIONS.map(p => [p.id, p]),
)
const PASTRY_BY_ID = new Map<string, PastryDef>(
  PASTRY_OPTIONS.map(p => [p.id, p]),
)

export function findIncludedProduct(id: string): IncludedProductDef | undefined {
  return INCLUDED_BY_ID.get(id)
}

export function findPremiumProduct(id: string): PremiumProductDef | undefined {
  return PREMIUM_BY_ID.get(id)
}

export function findProduct(
  id: string,
): IncludedProductDef | PremiumProductDef | undefined {
  return INCLUDED_BY_ID.get(id) ?? PREMIUM_BY_ID.get(id)
}

export function findMilk(id: string): MilkDef | undefined {
  return MILK_BY_ID.get(id)
}

export function findExtra(id: string): ExtraDef | undefined {
  return EXTRA_BY_ID.get(id)
}

export function findPastry(id: string): PastryDef | undefined {
  return PASTRY_BY_ID.get(id)
}

export function isPremiumProduct(id: string): boolean {
  return PREMIUM_BY_ID.has(id)
}

export function productHasMilk(id: string): boolean {
  return findProduct(id)?.hasMilk ?? false
}

export function productIsIced(id: string): boolean {
  return PREMIUM_BY_ID.get(id)?.isIced ?? false
}
