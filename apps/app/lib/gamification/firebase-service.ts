/**
 * gamification/firebase-service.ts
 *
 * Capa de persistencia Firestore para el sistema de gamificación.
 * Lee y escribe datos gamificados en customer_profiles.
 * Centraliza toda la interacción con Firebase — el engine.ts se mantiene puro.
 */

import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, increment, runTransaction, Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { StreakData } from "./types"
import { MISSIONS, BADGES } from "./constants"
import {
  checkNewBadges, updateStreak,
  buildGamificationState, getMissionStatus,
} from "./engine"

// ═══════════════════════════════════════════════════════════════
// LEER ESTADO RAW DESDE FIRESTORE
// ═══════════════════════════════════════════════════════════════

export interface GamificationRaw {
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
  totalRedemptions: number
  /** Historial reciente de transacciones de puntos (para PointsCard) */
  pointsHistory?: Array<{ description: string; type: string; amount: number }>
}

const DEFAULT_STREAK: StreakData = {
  currentStreak: 0,
  bestStreak: 0,
  lastActivityDate: "",
  weeklyStreak: 0,
}

/** Lee los datos gamificados del perfil del usuario */
export async function getGamificationRaw(uid: string): Promise<GamificationRaw> {
  const snap = await getDoc(doc(db, "customer_profiles", uid))
  const data = snap.data() || {}

  // SECURITY: Runtime validation of Firestore data shape
  // Ensure all fields have correct types with sensible defaults
  const validateNumber = (val: unknown, defaultVal: number = 0): number => {
    return typeof val === "number" ? val : defaultVal
  }

  const validateArray = <T = string>(val: unknown, defaultVal: T[] = [] as T[]): T[] => {
    return Array.isArray(val) ? (val as T[]) : defaultVal
  }

  const validateBoolean = (val: unknown, defaultVal: boolean = false): boolean => {
    return typeof val === "boolean" ? val : defaultVal
  }

  const validateObject = <T>(val: unknown, defaultVal: T): T => {
    return val && typeof val === "object" && !Array.isArray(val) ? (val as T) : defaultVal
  }

  return {
    granos: validateNumber(data.loyaltyPoints, 0),
    totalGranos: validateNumber(data.totalPointsEarned, 0),
    completedMissions: validateArray<string>(data.completedMissions, []),
    unlockedBadges: validateArray<string>(data.unlockedBadges, []),
    completedQuizzes: validateArray<string>(data.completedQuizzes, []),
    streak: validateObject<StreakData>(data.streak, DEFAULT_STREAK),
    totalPurchases: validateNumber(data.totalVisits, 0),
    uniqueProducts: validateNumber(data.uniqueProducts, 0),
    appOrders: validateNumber(data.appOrders, 0),
    hasReusableCup: validateBoolean(data.hasReusableCup, false),
    totalRedemptions: validateNumber(data.totalRedemptions, 0),
    pointsHistory: validateArray<{ description: string; type: string; amount: number }>(data.pointsHistory, []),
  }
}

/** Construye el estado completo de gamificación desde Firestore */
export async function getFullGamificationState(uid: string) {
  const raw = await getGamificationRaw(uid)
  return buildGamificationState(raw)
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZAR CAMPOS GAMIFICACIÓN (para usuarios nuevos o existentes)
// ═══════════════════════════════════════════════════════════════

export async function ensureGamificationFields(uid: string): Promise<void> {
  const ref = doc(db, "customer_profiles", uid)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    // Crear documento mínimo
    await setDoc(ref, {
      completedMissions: [],
      unlockedBadges: [],
      completedQuizzes: [],
      streak: DEFAULT_STREAK,
      uniqueProducts: 0,
      appOrders: 0,
      hasReusableCup: false,
      totalRedemptions: 0,
      loyaltyPoints: 0,
      totalPointsEarned: 0,
    }, { merge: true })
    return
  }

  // Para perfiles existentes: añadir solo campos faltantes
  const data = snap.data()
  const updates: Record<string, unknown> = {}

  if (data.completedMissions === undefined) updates.completedMissions = []
  if (data.unlockedBadges === undefined) updates.unlockedBadges = []
  if (data.completedQuizzes === undefined) updates.completedQuizzes = []
  if (data.streak === undefined) updates.streak = DEFAULT_STREAK
  if (data.uniqueProducts === undefined) updates.uniqueProducts = 0
  if (data.appOrders === undefined) updates.appOrders = 0
  if (data.hasReusableCup === undefined) updates.hasReusableCup = false
  if (data.totalRedemptions === undefined) updates.totalRedemptions = 0

  if (Object.keys(updates).length > 0) {
    await updateDoc(ref, updates)
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPLETAR MISIÓN
// ═══════════════════════════════════════════════════════════════

export async function completeMission(uid: string, missionId: string, reward: number): Promise<{ newBadges?: string[] }> {
  // ── V2: Server-side mission completion (validated + atomic) ──
  const { useServerLoyalty: isServerLoyalty, serverCompleteMission } = await import("@/lib/server-loyalty")
  if (isServerLoyalty()) {
    const res = await serverCompleteMission(uid, missionId)
    if (!res.ok) {
      console.error("[Gamification] Server mission complete failed:", res.error)
      return {}
    }
    return { newBadges: res.data?.newBadges || [] }
  }

  // ── Legacy: Client-side Firestore writes ──
  const ref = doc(db, "customer_profiles", uid)
  await updateDoc(ref, {
    completedMissions: arrayUnion(missionId),
    loyaltyPoints: increment(reward),
    totalPointsEarned: increment(reward),
  })
  return {}
}

// ═══════════════════════════════════════════════════════════════
// DESBLOQUEAR BADGE
// ═══════════════════════════════════════════════════════════════

export async function unlockBadge(uid: string, badgeId: string, bonusReward: number): Promise<void> {
  // En V2, badges se desbloquean server-side via checkAndAwardBadges()
  const { useServerLoyalty: isServerLoyalty } = await import("@/lib/server-loyalty")
  if (isServerLoyalty()) return // server handles it

  const ref = doc(db, "customer_profiles", uid)
  const updates: Record<string, unknown> = {
    unlockedBadges: arrayUnion(badgeId),
  }
  if (bonusReward > 0) {
    updates.loyaltyPoints = increment(bonusReward)
    updates.totalPointsEarned = increment(bonusReward)
  }
  await updateDoc(ref, updates)
}

// ═══════════════════════════════════════════════════════════════
// DETECTAR Y DESBLOQUEAR BADGES NUEVOS
// ═══════════════════════════════════════════════════════════════

/** Revisa si hay badges nuevos que desbloquear y los persiste.
 *  Retorna array de badge IDs nuevos (para celebración UI). */
export async function checkAndUnlockBadges(uid: string): Promise<string[]> {
  // En V2, badges se manejan server-side
  const { useServerLoyalty: isServerLoyalty } = await import("@/lib/server-loyalty")
  if (isServerLoyalty()) return [] // server handles it

  const raw = await getGamificationRaw(uid)

  const newBadgeIds = checkNewBadges({
    completedQuizzes: raw.completedQuizzes,
    totalPurchases: raw.totalPurchases,
    uniqueProducts: raw.uniqueProducts,
    appOrders: raw.appOrders,
    totalRedemptions: raw.totalRedemptions,
    weeklyStreak: raw.streak.weeklyStreak,
    hasReusableCup: raw.hasReusableCup,
    unlockedBadges: raw.unlockedBadges,
  })

  // Desbloquear cada badge y sumar bonus
  for (const badgeId of newBadgeIds) {
    const badge = BADGES.find(b => b.id === badgeId)
    await unlockBadge(uid, badgeId, badge?.bonusReward ?? 0)
  }

  return newBadgeIds
}

// ═══════════════════════════════════════════════════════════════
// ACTUALIZAR STREAK
// ═══════════════════════════════════════════════════════════════

export async function updateUserStreak(uid: string): Promise<StreakData> {
  const ref = doc(db, "customer_profiles", uid)
  const snap = await getDoc(ref)
  const data = snap.data() || {}
  const currentStreak: StreakData = data.streak ?? DEFAULT_STREAK
  // Use local date (YYYY-MM-DD) instead of toISOString() which converts to UTC
  // This ensures streak comparison uses the user's local timezone
  const today = new Date().toLocaleDateString("en-CA") // "en-CA" locale gives YYYY-MM-DD format

  const newStreak = updateStreak(currentStreak, today)

  if (
    newStreak.currentStreak !== currentStreak.currentStreak ||
    newStreak.lastActivityDate !== currentStreak.lastActivityDate
  ) {
    await updateDoc(ref, { streak: newStreak })
  }

  return newStreak
}

// ═══════════════════════════════════════════════════════════════
// AUTO-COMPLETAR MISIONES
// ═══════════════════════════════════════════════════════════════

/** Revisa todas las misiones y completa las que cumplen criterios.
 *  Retorna IDs de misiones recién completadas.
 *  SECURITY: Uses Firestore transaction to atomically check and complete missions,
 *  preventing race conditions when multiple operations occur concurrently. */
export async function checkAndCompleteMissions(uid: string): Promise<string[]> {
  // En V2, mission completion is validated + completed server-side
  const { useServerLoyalty: isServerLoyalty } = await import("@/lib/server-loyalty")
  if (isServerLoyalty()) return [] // server handles it in awardPurchasePoints / completeQuiz

  // SECURITY: Use transaction to atomically read and update missions
  const newlyCompleted = await runTransaction(db, async (transaction) => {
    const raw = await getGamificationRaw(uid)
    const completedMissionsInTx: string[] = []

    const activityState = {
      completedQuizzes: raw.completedQuizzes,
      totalPurchases: raw.totalPurchases,
      uniqueProducts: raw.uniqueProducts,
      appOrders: raw.appOrders,
      weeklyStreak: raw.streak.weeklyStreak,
    }

    const ref = doc(db, "customer_profiles", uid)

    for (const mission of MISSIONS) {
      // Saltear si ya está completada
      if (raw.completedMissions.includes(mission.id)) continue

      const { status } = getMissionStatus(mission, raw.completedMissions, activityState)
      if (status === "completed") {
        // Add mission within transaction
        transaction.update(ref, {
          completedMissions: arrayUnion(mission.id),
          loyaltyPoints: increment(mission.reward),
          totalPointsEarned: increment(mission.reward),
          pointsHistory: arrayUnion({
            type: "MISSION",
            amount: mission.reward,
            transactionId: `mission-${mission.id}`,
            earnedAt: Timestamp.now(),
            description: `Misión: ${mission.title}`,
          }),
        })
        completedMissionsInTx.push(mission.id)
        // Actualizar local para que misiones encadenadas se resuelvan en la misma llamada
        raw.completedMissions.push(mission.id)
      }
    }

    return completedMissionsInTx
  })

  return newlyCompleted
}

// ═══════════════════════════════════════════════════════════════
// INCREMENTAR CONTADORES POST-COMPRA
// ═══════════════════════════════════════════════════════════════

/** Registra una compra para gamificación: actualiza contadores,
 *  productos únicos, streak, badges y misiones.
 *  Retorna badges y misiones nuevas (para celebración UI).
 *
 *  En modo V2 (server loyalty), los side-effects de gamificación
 *  se ejecutan en el server dentro de awardPurchasePoints().
 *  Aquí solo ejecutamos los side-effects locales como fallback. */
export async function recordPurchaseForGamification(
  uid: string,
  opts: { productNames: string[]; source: "APP" | "POS"; orderId?: string; euroAmount?: number }
): Promise<{ newBadges: string[]; newMissions: string[] }> {
  // ── V2: Server handles all gamification side-effects during awardPurchasePoints ──
  const { useServerLoyalty: isServerLoyalty } = await import("@/lib/server-loyalty")
  if (isServerLoyalty()) {
    // En modo server, awardPoints ya maneja streak, badges, missions server-side.
    // Solo necesitamos retornar vacío — la UI leerá el estado actualizado del server.
    return { newBadges: [], newMissions: [] }
  }

  // ── Legacy: Client-side gamification side-effects ──
  const ref = doc(db, "customer_profiles", uid)

  // Leer productos existentes para calcular únicos
  const snap = await getDoc(ref)
  const data = snap.data() || {}
  const existingProducts: string[] = data.knownProducts ?? []
  const newProducts = opts.productNames.filter(p => !existingProducts.includes(p))
  const uniqueIncrement = newProducts.length

  const updates: Record<string, unknown> = {}

  if (opts.source === "APP") {
    updates.appOrders = increment(1)
  }

  if (uniqueIncrement > 0) {
    updates.uniqueProducts = increment(uniqueIncrement)
    // arrayUnion acepta múltiples args — pasar todos de una vez
    updates.knownProducts = arrayUnion(...newProducts)
  }

  if (Object.keys(updates).length > 0) {
    await updateDoc(ref, updates)
  }

  // Actualizar streak
  await updateUserStreak(uid)

  // Detectar y desbloquear badges
  const newBadges = await checkAndUnlockBadges(uid)

  // Auto-completar misiones
  const newMissions = await checkAndCompleteMissions(uid)

  return { newBadges, newMissions }
}
