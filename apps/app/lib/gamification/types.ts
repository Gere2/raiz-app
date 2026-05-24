/**
 * gamification/types.ts
 *
 * Tipos centrales del sistema de gamificación de Raíz y Grano.
 * "Granos" como moneda de marca. Niveles cafeteros. Misiones. Badges.
 */

// ═══════════════════════════════════════════════════════════════
// MONEDA & NIVELES
// ═══════════════════════════════════════════════════════════════

export type LevelId = "semilla" | "brote" | "raiz" | "cosecha" | "barista"

export interface Level {
  id: LevelId
  name: string
  nameEn: string
  emoji: string
  /** Granos totales acumulados para alcanzar este nivel */
  threshold: number
  /** Color Tailwind para UI */
  color: string
  /** Frase corta de microcopy */
  tagline: string
  taglineEn: string
}

// ═══════════════════════════════════════════════════════════════
// PERFIL CAFETERO
// ═══════════════════════════════════════════════════════════════

export type CoffeeProfileTrait =
  | "intenso"      // prefiere shots fuertes, espresso
  | "suave"        // prefiere suave/dulce, lattes
  | "explorador"   // prueba cosas nuevas
  | "clasico"      // repite lo mismo siempre
  | "rapido"       // pide rápido, order-ahead
  | "curioso"      // hace quizzes, aprende
  | "sostenible"   // reutilizable, conscious
  | "social"       // comparte, invita

export interface CoffeeProfile {
  /** Rasgos principales (máx 3) */
  traits: CoffeeProfileTrait[]
  /** Bebida favorita detectada por compras */
  favoriteDrink?: string
  /** Preferencia de leche */
  milkPreference?: "regular" | "vegetal" | "sin" | "cualquiera"
  /** Hora habitual de compra */
  peakHour?: string
  /** Nivel de conocimiento cafetero (de quizzes) */
  coffeeKnowledge: "novato" | "curioso" | "entendido" | "experto"
}

// ═══════════════════════════════════════════════════════════════
// MISIONES
// ═══════════════════════════════════════════════════════════════

export type MissionCategory =
  | "onboarding"
  | "weekly"
  | "discovery"
  | "recurrence"
  | "product"
  | "operational"

export type MissionStatus = "locked" | "active" | "completed" | "expired"

export interface MissionCriterion {
  type: "purchase_count" | "quiz_complete" | "unique_products" | "order_ahead"
       | "reusable_cup" | "streak_days" | "spend_amount" | "badge_earned"
       | "profile_complete" | "first_purchase" | "invite_friend"
  /** Cantidad necesaria para completar */
  target: number
  /** Progreso actual (calculado en runtime) */
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
  /** Granos de recompensa */
  reward: number
  /** Badge que se desbloquea al completar (opcional) */
  badgeId?: string
  criteria: MissionCriterion[]
  /** Ventana temporal (null = sin caducidad) */
  expiresInDays?: number
  /** Orden de prioridad (menor = más importante) */
  priority: number
  /** Misión previa requerida */
  requiresMissionId?: string
}

// ═══════════════════════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════════════════════

export type BadgeCategory =
  | "exploration"
  | "recurrence"
  | "knowledge"
  | "sustainability"
  | "community"
  | "speed"

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
  /** Criterio para desbloquear (texto legible) */
  unlockCriteria: string
  unlockCriteriaEn: string
  /** Mensaje de celebración al desbloquear */
  celebration: string
  celebrationEn: string
  /** Granos bonus al desbloquear */
  bonusReward: number
}

// ═══════════════════════════════════════════════════════════════
// STREAK & ENGAGEMENT
// ═══════════════════════════════════════════════════════════════

export interface StreakData {
  /** Días consecutivos con actividad (compra o quiz) */
  currentStreak: number
  /** Mejor racha histórica */
  bestStreak: number
  /** Última fecha de actividad (ISO string) */
  lastActivityDate: string
  /** Semanas consecutivas con al menos 1 actividad */
  weeklyStreak: number
}

// ═══════════════════════════════════════════════════════════════
// ESTADO COMPLETO DEL JUGADOR
// ═══════════════════════════════════════════════════════════════

export interface GamificationState {
  /** Granos actuales (gastables) */
  granos: number
  /** Granos totales acumulados históricamente (para nivel) */
  totalGranos: number
  /** Nivel actual calculado */
  level: Level
  /** Progreso al siguiente nivel (0-100) */
  levelProgress: number
  /** Granos que faltan para el siguiente nivel */
  granosToNextLevel: number
  /** Perfil cafetero */
  coffeeProfile: CoffeeProfile
  /** IDs de misiones completadas */
  completedMissions: string[]
  /** IDs de badges desbloqueados */
  unlockedBadges: string[]
  /** IDs de quizzes completados */
  completedQuizzes: string[]
  /** Datos de racha */
  streak: StreakData
}
