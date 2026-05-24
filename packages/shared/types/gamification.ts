/**
 * types/gamification.ts — Badges, misiones, quizzes
 * Source of truth: orgs/{orgId}/badges, missions, quizzes
 */

// ── Levels ──

export type LevelId = "semilla" | "brote" | "raiz" | "cosecha" | "barista"

export interface Level {
  id: LevelId
  name: string
  nameEn: string
  emoji: string
  threshold: number
  color: string
  tagline: string
  taglineEn: string
}

// ── Badges ──

export type BadgeCategory = "exploration" | "recurrence" | "knowledge" | "sustainability" | "community" | "speed"
export type BadgeRarity = "common" | "rare" | "epic" | "legendary"

export interface Badge {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  emoji: string
  category: BadgeCategory
  rarity: BadgeRarity
  unlockCriteria: string
  unlockCriteriaEn: string
  celebration: string
  celebrationEn: string
  bonusReward: number
  /** Activo en el sistema */
  enabled?: boolean
  sortOrder?: number
}

// ── Missions ──

export type MissionCategory = "onboarding" | "weekly" | "discovery" | "recurrence" | "product" | "operational" | "seasonal"
export type MissionStatus = "locked" | "active" | "completed" | "expired"

export interface MissionCriterion {
  type:
    | "purchase_count"
    | "quiz_complete"
    | "unique_products"
    | "order_ahead"
    | "reusable_cup"
    | "streak_days"
    | "spend_amount"
    | "badge_earned"
    | "profile_complete"
    | "first_purchase"
    | "invite_friend"
  target: number
  current?: number
}

export interface Mission {
  id: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  emoji: string
  category: MissionCategory
  reward: number
  badgeId?: string
  criteria: MissionCriterion[]
  expiresInDays?: number
  priority: number
  requiresMissionId?: string
  /** Activo en el sistema */
  enabled?: boolean
  /** Periodo académico en que se activa (seasonal) */
  academicPeriod?: string
  createdAt?: unknown
  updatedAt?: unknown
}

// ── Quizzes ──

export interface QuizQuestion {
  question: string
  questionEn: string
  options: string[]
  optionsEn: string[]
  correctIndex: number
  explanation: string
  explanationEn: string
}

export type QuizCadence = "once" | "monthly" | "weekly"
export type QuizModuleId = "bienvenida" | "cafe-actual" | "semanal"

export interface Quiz {
  id: string
  title: string
  titleEn: string
  description?: string
  descriptionEn?: string
  emoji: string
  points: number
  questions: QuizQuestion[]
  moduleId: QuizModuleId
  cadence: QuizCadence
  /** Activo en el sistema */
  enabled?: boolean
  sortOrder?: number
  createdAt?: unknown
  updatedAt?: unknown
}

export interface QuizModule {
  id: QuizModuleId
  title: string
  titleEn: string
  emoji: string
  description: string
  descriptionEn: string
  quizzes: Quiz[]
}

// ── Game State ──

export interface GamificationState {
  granos: number
  totalGranos: number
  level: Level
  levelProgress: number
  granosToNextLevel: number
  coffeeProfile: {
    traits: import("./customer").CoffeeProfileTrait[]
    favoriteDrink?: string
    milkPreference?: "regular" | "vegetal" | "sin" | "cualquiera"
    peakHour?: string
    coffeeKnowledge: import("./customer").CoffeeKnowledge
  }
  completedMissions: string[]
  unlockedBadges: string[]
  completedQuizzes: string[]
  streak: import("./customer").StreakData
}
