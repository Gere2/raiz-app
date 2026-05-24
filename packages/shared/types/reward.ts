/**
 * types/reward.ts — Recompensas y canjes
 * Source of truth: orgs/{orgId}/rewards_catalog + redemptions
 */

export type RewardCategory = "drinks" | "food" | "merch" | "experience"

export interface Reward {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  /** Coste en granos para canjear */
  pointsCost: number
  emoji: string
  category: RewardCategory
  enabled: boolean
  /** Coste real estimado (food cost) — calculado por Brain */
  estimatedFoodCost?: number
  /** Producto vinculado (opcional) */
  productId?: string
  /** Orden de display */
  sortOrder?: number
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Redemption {
  id?: string
  uid: string
  rewardId: string
  rewardName: string
  pointsSpent: number
  /** Código de 6 caracteres para mostrar al barista */
  code: string
  status: "pending" | "used" | "expired"
  createdAt: unknown
  usedAt?: unknown
  expiresAt: unknown
}
