/**
 * types/customer.ts — Perfil de cliente unificado
 * Source of truth: customer_profiles en Firestore
 */

export type CustomerSegment = "new" | "occasional" | "regular" | "loyal" | "churning"
export type CoffeeKnowledge = "novato" | "curioso" | "entendido" | "experto"

export type CoffeeProfileTrait =
  | "intenso"
  | "suave"
  | "explorador"
  | "clasico"
  | "rapido"
  | "curioso"
  | "sostenible"
  | "social"

export interface StreakData {
  currentStreak: number
  bestStreak: number
  lastActivityDate: string
  weeklyStreak: number
}

export interface CustomerProfile {
  id: string
  uid?: string
  type?: "app" | "teacher" | "pos_anonymous"
  email?: string
  name?: string

  // Behavioral
  totalVisits: number
  totalSpent: number
  avgTicket: number
  lastVisit?: unknown
  firstVisit?: unknown

  // Segmentation
  segment: CustomerSegment
  lastSegmentUpdate?: unknown

  // Loyalty
  loyaltyPoints: number
  totalPointsEarned: number

  // Gamification
  completedMissions: string[]
  unlockedBadges: string[]
  completedQuizzes: string[]
  streak: StreakData
  uniqueProducts?: number
  appOrders?: number
  hasReusableCup?: boolean
  totalRedemptions?: number

  // Preferences
  favoriteProducts: string[]
  coffeeProfileTraits?: CoffeeProfileTrait[]
  coffeeKnowledge?: CoffeeKnowledge
  preferredPaymentMethod?: string
  preferredTimeSlot?: string
  preferredDayOfWeek?: number

  // Metadata
  createdAt?: unknown
  updatedAt?: unknown
}
