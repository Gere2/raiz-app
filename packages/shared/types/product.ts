/**
 * types/product.ts — Tipos compartidos de catálogo
 * Source of truth: Brain define, POS y App consumen
 */

export interface Product {
  id: string
  name: string
  name_en?: string
  price: number
  category: string
  origin?: string
  available: boolean
  imageUrl?: string
  description?: string
  description_en?: string
  /** Link a receta en Brain (opcional) */
  recipeId?: string
  /** Food cost derivado de Brain (opcional) */
  foodCostPct?: number
  /** Estado derivado de stock */
  stockStatus?: "available" | "low_stock" | "out_of_stock"
  /** IDs de modifiers disponibles (futuro) */
  modifierIds?: string[]
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Category {
  id: string
  name: string
  name_en?: string
  emoji?: string
  order?: number
  createdAt?: unknown
  updatedAt?: unknown
}

/** Modifier para variantes de producto (futuro - Fase 2) */
export interface Modifier {
  id: string
  name: string
  name_en?: string
  type: "single" | "multi"
  options: ModifierOption[]
  required: boolean
}

export interface ModifierOption {
  id: string
  name: string
  name_en?: string
  priceDelta: number
}
