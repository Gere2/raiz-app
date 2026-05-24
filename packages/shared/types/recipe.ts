/**
 * types/recipe.ts — Recetas y escandallos
 * Source of truth: orgs/{orgId}/recipes
 */

export interface RecipeIngredient {
  id: string
  catalogItemId: string
  name: string
  qty: number
  unit: string
  baseQty: number
  baseUnit: string
  unitCost: number
  lineCost: number
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Recipe {
  id: string
  name: string
  yieldQty: number
  yieldUnit: string
  sellingPrice: number
  totalCost: number
  foodCostPct: number
  productId?: string
  productName?: string
  ingredients?: RecipeIngredient[]
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Packaging {
  id: string
  name: string
  items: PackagingItem[]
  totalCost: number
  version: number
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface PackagingItem {
  name: string
  unitCost: number
  qty: number
}

export interface Sku {
  id: string
  name: string
  category: string
  station: string
  standardTimeSec: number
  version: number
  status: string
  posProductId?: string
  sellingPrice: number
  recipeId?: string
  packagingId?: string
  recipeCost: number
  packagingCost: number
  totalCost: number
  margin: number
  foodCostPct: number
  allergens: string[]
  qcChecks: string[]
  substitutions: Array<{ from: string; to: string; costDelta: number; note: string }>
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}
