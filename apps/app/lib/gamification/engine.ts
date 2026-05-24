/**
 * gamification/engine.ts
 *
 * Motor puro de gamificación. Funciones sin side effects.
 * Calcula niveles, progreso, elegibilidad de misiones, badges, streaks.
 * No depende de Firebase — recibe datos y devuelve resultados.
 */

import type {
  Level, LevelId, GamificationState, StreakData,
  CoffeeProfile, CoffeeProfileTrait, Badge, Mission, MissionStatus,
} from "./types"
import { LEVELS, BADGES, MISSIONS, STREAK_WEEKLY_BONUS, STREAK_BONUS_CAP } from "./constants"

// ═══════════════════════════════════════════════════════════════
// NIVELES
// ═══════════════════════════════════════════════════════════════

/** Obtener nivel actual basado en granos totales acumulados */
export function getLevel(totalGranos: number): Level {
  let current = LEVELS[0]
  for (const level of LEVELS) {
    if (totalGranos >= level.threshold) current = level
    else break
  }
  return current
}

/** Obtener el siguiente nivel (null si es máximo) */
export function getNextLevel(currentLevelId: LevelId): Level | null {
  const idx = LEVELS.findIndex(l => l.id === currentLevelId)
  if (idx < 0 || idx >= LEVELS.length - 1) return null
  return LEVELS[idx + 1]
}

/** Calcular progreso al siguiente nivel (0-100) */
export function getLevelProgress(totalGranos: number): number {
  const current = getLevel(totalGranos)
  const next = getNextLevel(current.id)
  if (!next) return 100 // max level

  const rangeStart = current.threshold
  const rangeEnd = next.threshold
  const progress = ((totalGranos - rangeStart) / (rangeEnd - rangeStart)) * 100

  return Math.min(100, Math.max(0, Math.round(progress)))
}

/** Granos que faltan para el siguiente nivel */
export function getGranosToNextLevel(totalGranos: number): number {
  const current = getLevel(totalGranos)
  const next = getNextLevel(current.id)
  if (!next) return 0
  return Math.max(0, next.threshold - totalGranos)
}

// ═══════════════════════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════════════════════

/** Obtener badge por ID */
export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find(b => b.id === id)
}

/** Verificar qué badges nuevos debería desbloquear el usuario.
 *  Recibe el estado actual y devuelve IDs de badges nuevos. */
export function checkNewBadges(state: {
  completedQuizzes: string[]
  totalPurchases: number
  uniqueProducts: number
  appOrders: number
  totalRedemptions: number
  weeklyStreak: number
  hasReusableCup: boolean
  unlockedBadges: string[]
}): string[] {
  const newBadges: string[] = []
  const already = new Set(state.unlockedBadges)

  // first-sip: 1 compra
  if (!already.has("first-sip") && state.totalPurchases >= 1) newBadges.push("first-sip")

  // flavor-explorer: 5 productos distintos
  if (!already.has("flavor-explorer") && state.uniqueProducts >= 5) newBadges.push("flavor-explorer")

  // menu-master: 10 productos distintos
  if (!already.has("menu-master") && state.uniqueProducts >= 10) newBadges.push("menu-master")

  // weekly-ritual: 4 semanas consecutivas
  if (!already.has("weekly-ritual") && state.weeklyStreak >= 4) newBadges.push("weekly-ritual")

  // loyal-regular: 25 compras
  if (!already.has("loyal-regular") && state.totalPurchases >= 25) newBadges.push("loyal-regular")

  // curious-mind: 1 quiz
  if (!already.has("curious-mind") && state.completedQuizzes.length >= 1) newBadges.push("curious-mind")

  // coffee-scholar: todos los quizzes de bienvenida
  const welcomeQuizIds = ["welcome-profile", "welcome-specialty"]
  if (!already.has("coffee-scholar") && welcomeQuizIds.every(id => state.completedQuizzes.includes(id))) {
    newBadges.push("coffee-scholar")
  }

  // coffee-expert: 8 quizzes
  if (!already.has("coffee-expert") && state.completedQuizzes.length >= 8) newBadges.push("coffee-expert")

  // green-choice: vaso reutilizable
  if (!already.has("green-choice") && state.hasReusableCup) newBadges.push("green-choice")

  // first-redeem: 1 canje
  if (!already.has("first-redeem") && state.totalRedemptions >= 1) newBadges.push("first-redeem")

  // order-ahead-pro: 3 pedidos app
  if (!already.has("order-ahead-pro") && state.appOrders >= 3) newBadges.push("order-ahead-pro")

  return newBadges
}

// ═══════════════════════════════════════════════════════════════
// MISIONES
// ═══════════════════════════════════════════════════════════════

/** Calcular estado de una misión */
export function getMissionStatus(
  mission: Mission,
  completedMissions: string[],
  state: {
    completedQuizzes: string[]
    totalPurchases: number
    uniqueProducts: number
    appOrders: number
    weeklyStreak: number
  }
): { status: MissionStatus; progress: number; total: number } {
  // Ya completada?
  if (completedMissions.includes(mission.id)) {
    const total = mission.criteria.reduce((s, c) => s + c.target, 0)
    return { status: "completed", progress: total, total }
  }

  // Requiere misión previa?
  if (mission.requiresMissionId && !completedMissions.includes(mission.requiresMissionId)) {
    return { status: "locked", progress: 0, total: mission.criteria.reduce((s, c) => s + c.target, 0) }
  }

  // Calcular progreso
  let totalProgress = 0
  let totalTarget = 0

  for (const criterion of mission.criteria) {
    let current = 0
    switch (criterion.type) {
      case "quiz_complete":
        current = state.completedQuizzes.length
        break
      case "purchase_count":
      case "first_purchase":
        current = state.totalPurchases
        break
      case "unique_products":
        current = state.uniqueProducts
        break
      case "order_ahead":
        current = state.appOrders
        break
      case "streak_days":
        current = state.weeklyStreak
        break
      default:
        current = 0
    }
    totalProgress += Math.min(current, criterion.target)
    totalTarget += criterion.target
  }

  const isComplete = totalProgress >= totalTarget

  return {
    status: isComplete ? "completed" : "active",
    progress: totalProgress,
    total: totalTarget,
  }
}

/** Obtener misiones activas ordenadas por prioridad.
 *  Acepta opcionalmente un array de misiones dinámicas (de Firestore).
 *  Si no se pasa, usa las hardcoded MISSIONS. */
export function getActiveMissions(
  completedMissions: string[],
  state: {
    completedQuizzes: string[]
    totalPurchases: number
    uniqueProducts: number
    appOrders: number
    weeklyStreak: number
  },
  dynamicMissions?: Mission[],
): Array<Mission & { progress: number; total: number; status: MissionStatus }> {
  const missionList = dynamicMissions && dynamicMissions.length > 0 ? dynamicMissions : MISSIONS
  return missionList
    .map(m => {
      const { status, progress, total } = getMissionStatus(m, completedMissions, state)
      return { ...m, status, progress, total }
    })
    .filter(m => m.status === "active" || m.status === "locked")
    .sort((a, b) => {
      // Activas antes que bloqueadas
      if (a.status === "active" && b.status === "locked") return -1
      if (a.status === "locked" && b.status === "active") return 1
      return a.priority - b.priority
    })
}

// ═══════════════════════════════════════════════════════════════
// STREAK
// ═══════════════════════════════════════════════════════════════

/** Calcular si la racha sigue activa y actualizarla */
export function updateStreak(streak: StreakData, today: string): StreakData {
  if (!streak.lastActivityDate) {
    return { ...streak, currentStreak: 1, lastActivityDate: today }
  }

  const last = new Date(streak.lastActivityDate)
  const now = new Date(today)
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return streak // Ya contado hoy
  if (diffDays === 1) {
    // Consecutivo — día siguiente
    const newStreak = streak.currentStreak + 1
    // Cada vez que completamos 7 días seguidos, incrementamos weeklyStreak
    const crossedWeekBoundary = Math.floor(newStreak / 7) > Math.floor(streak.currentStreak / 7)
    return {
      currentStreak: newStreak,
      bestStreak: Math.max(streak.bestStreak, newStreak),
      lastActivityDate: today,
      weeklyStreak: crossedWeekBoundary ? streak.weeklyStreak + 1 : streak.weeklyStreak,
    }
  }
  if (diffDays <= 7) {
    // Gap de 2-7 días: daily streak se reinicia pero weekly sobrevive.
    // El weekly streak cuenta "semanas con al menos 1 actividad",
    // así que si el usuario vuelve dentro de 7 días, sigue en racha semanal.
    return {
      currentStreak: 1,
      bestStreak: streak.bestStreak,
      lastActivityDate: today,
      weeklyStreak: streak.weeklyStreak + 1,
    }
  }

  // Más de 7 días sin actividad: rompe racha semanal
  return {
    currentStreak: 1,
    bestStreak: streak.bestStreak,
    lastActivityDate: today,
    weeklyStreak: 0,
  }
}

/** Calcular bonus de racha (semanal, con techo) */
export function getStreakBonus(weeklyStreak: number): number {
  if (weeklyStreak < 2) return 0
  return Math.min((weeklyStreak - 1) * STREAK_WEEKLY_BONUS, STREAK_BONUS_CAP)
}

// ═══════════════════════════════════════════════════════════════
// PERFIL CAFETERO
// ═══════════════════════════════════════════════════════════════

/** Inferir rasgos del perfil a partir de datos de comportamiento */
export function inferCoffeeProfile(data: {
  totalPurchases: number
  uniqueProducts: number
  completedQuizzes: number
  appOrders: number
  hasReusableCup: boolean
  avgOrderTime?: number // hour 0-23
}): CoffeeProfileTrait[] {
  const traits: CoffeeProfileTrait[] = []

  // Explorador: muchos productos distintos
  if (data.uniqueProducts >= 5) traits.push("explorador")

  // Clásico: compra mucho pero pocos productos distintos
  if (data.totalPurchases > 10 && data.uniqueProducts <= 3) traits.push("clasico")

  // Curioso: hace quizzes
  if (data.completedQuizzes >= 3) traits.push("curioso")

  // Rápido: usa la app para pedir
  if (data.appOrders >= 3) traits.push("rapido")

  // Sostenible: vaso reutilizable
  if (data.hasReusableCup) traits.push("sostenible")

  // Retornar máximo 3 traits
  return traits.slice(0, 3)
}

/** Determinar nivel de conocimiento cafetero */
export function getCoffeeKnowledge(completedQuizzes: number): CoffeeProfile["coffeeKnowledge"] {
  if (completedQuizzes >= 8) return "experto"
  if (completedQuizzes >= 5) return "entendido"
  if (completedQuizzes >= 2) return "curioso"
  return "novato"
}

// ═══════════════════════════════════════════════════════════════
// ESTADO COMPLETO
// ═══════════════════════════════════════════════════════════════

/** Construir estado completo de gamificación a partir de datos raw */
export function buildGamificationState(raw: {
  granos: number
  totalGranos: number
  completedMissions: string[]
  unlockedBadges: string[]
  completedQuizzes: string[]
  streak: StreakData
  totalPurchases: number
  uniqueProducts: number
  appOrders: number
  hasReusableCup: boolean
}): GamificationState {
  const level = getLevel(raw.totalGranos)
  const traits = inferCoffeeProfile({
    totalPurchases: raw.totalPurchases,
    uniqueProducts: raw.uniqueProducts,
    completedQuizzes: raw.completedQuizzes.length,
    appOrders: raw.appOrders,
    hasReusableCup: raw.hasReusableCup,
  })

  return {
    granos: raw.granos,
    totalGranos: raw.totalGranos,
    level,
    levelProgress: getLevelProgress(raw.totalGranos),
    granosToNextLevel: getGranosToNextLevel(raw.totalGranos),
    coffeeProfile: {
      traits,
      coffeeKnowledge: getCoffeeKnowledge(raw.completedQuizzes.length),
    },
    completedMissions: raw.completedMissions,
    unlockedBadges: raw.unlockedBadges,
    completedQuizzes: raw.completedQuizzes,
    streak: raw.streak,
  }
}
