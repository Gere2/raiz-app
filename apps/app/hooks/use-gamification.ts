"use client"

/**
 * useGamification — Hook central del sistema de gamificación.
 *
 * Conecta el engine puro con Firebase y expone el estado
 * completo de gamificación + datos raw para cálculos de misiones.
 * Usa onSnapshot para actualizaciones en tiempo real.
 *
 * Uso: const { state, raw, loading, refresh } = useGamification()
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { GamificationState } from "@/lib/gamification/types"
import type { StreakData } from "@/lib/gamification/types"
import { buildGamificationState, getMissionStatus } from "@/lib/gamification/engine"
import { MISSIONS } from "@/lib/gamification/constants"
import {
  ensureGamificationFields,
  type GamificationRaw,
} from "@/lib/gamification/firebase-service"

const DEFAULT_STREAK: StreakData = {
  currentStreak: 0,
  bestStreak: 0,
  lastActivityDate: "",
  weeklyStreak: 0,
}

/** Convierte un doc de Firestore a GamificationRaw */
function docToRaw(data: Record<string, any>): GamificationRaw {
  return {
    granos: data.loyaltyPoints ?? 0,
    totalGranos: data.totalPointsEarned ?? 0,
    completedMissions: data.completedMissions ?? [],
    unlockedBadges: data.unlockedBadges ?? [],
    completedQuizzes: data.completedQuizzes ?? [],
    streak: data.streak ?? DEFAULT_STREAK,
    totalPurchases: data.totalVisits ?? 0,
    uniqueProducts: data.uniqueProducts ?? 0,
    appOrders: data.appOrders ?? 0,
    hasReusableCup: data.hasReusableCup ?? false,
    totalRedemptions: data.totalRedemptions ?? 0,
    // Historial de transacciones de puntos (para PointsCard)
    pointsHistory: (data.pointsHistory ?? []) as Array<{
      description: string
      type: string
      amount: number
    }>,
  }
}

interface UseGamificationReturn {
  state: GamificationState | null
  raw: GamificationRaw | null
  /** Código numérico de 4 dígitos para identificación en POS */
  numericCode: string | null
  loading: boolean
  error: string | null
  /** Refrescar estado desde Firestore (manual) */
  refresh: () => Promise<void>
}

export function useGamification(): UseGamificationReturn {
  const { user } = useAuth()
  const [state, setState] = useState<GamificationState | null>(null)
  const [raw, setRaw] = useState<GamificationRaw | null>(null)
  const [numericCode, setNumericCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initializedRef = useRef(false)
  const reconcilingRef = useRef(false)

  // Inicializar campos una sola vez
  useEffect(() => {
    if (!user?.uid) return
    if (initializedRef.current) return
    initializedRef.current = true
    ensureGamificationFields(user.uid).catch(console.warn)
  }, [user?.uid])

  // onSnapshot para tiempo real
  useEffect(() => {
    if (!user?.uid) {
      setState(null)
      setRaw(null)
      setNumericCode(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const ref = doc(db, "customer_profiles", user.uid)
    // SECURITY: Track mount state to prevent state updates after unmount
    let isMounted = true

    const unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        // Only update state if component is still mounted
        if (!isMounted) return

        const data = snap.data() || {}
        const rawData = docToRaw(data)
        const fullState = buildGamificationState(rawData)

        setRaw(rawData)
        setState(fullState)
        setError(null)
        setLoading(false)

        // ── Reconciliar misiones pendientes ──
        // Si una misión cumple criterios (status=completed) pero aún no está
        // registrada en completedMissions, los puntos nunca se sumaron.
        // Disparar checkAndCompleteMissions para acreditarlos atómicamente.
        if (!reconcilingRef.current) {
          const activity = {
            completedQuizzes: rawData.completedQuizzes,
            totalPurchases: rawData.totalPurchases,
            uniqueProducts: rawData.uniqueProducts,
            appOrders: rawData.appOrders,
            weeklyStreak: rawData.streak.weeklyStreak,
          }
          const hasPending = MISSIONS.some((m) => {
            if (rawData.completedMissions.includes(m.id)) return false
            const { status } = getMissionStatus(m, rawData.completedMissions, activity)
            return status === "completed"
          })
          if (hasPending) {
            reconcilingRef.current = true
            try {
              const { useServerLoyalty, serverReconcileMissions } = await import("@/lib/server-loyalty")
              if (useServerLoyalty()) {
                // V2: delegar al server para que evalúe + acredite puntos atómicamente
                const res = await serverReconcileMissions(user.uid)
                if (!res.ok) {
                  console.warn("[Gamification] Server mission reconcile failed:", res.error)
                }
              } else {
                // Legacy: reconciliación client-side
                const { checkAndCompleteMissions } = await import("@/lib/gamification/firebase-service")
                await checkAndCompleteMissions(user.uid)
              }
            } catch (err) {
              console.warn("[Gamification] Error reconciling missions:", err)
            } finally {
              // Permitir otra reconciliación más tarde si apareciesen nuevas misiones pendientes
              setTimeout(() => { reconcilingRef.current = false }, 2000)
            }
          }
        }

        // Auto-reparar numericCode si es "0000" o falta
        const code = data.numericCode
        if (!code || code === "0000") {
          try {
            const { generateNumericCode } = await import("@/lib/loyalty-points-service")
            const { setDoc: sd } = await import("firebase/firestore")
            const newCode = generateNumericCode(user.uid)
            await sd(ref, { numericCode: newCode }, { merge: true })
            // Check mount state again after async operation
            if (isMounted) {
              setNumericCode(newCode)
            }
          } catch (err) {
            console.warn("[Gamification] Error fixing numericCode:", err)
            if (isMounted) {
              setNumericCode(code || null)
            }
          }
        } else {
          if (isMounted) {
            setNumericCode(code)
          }
        }
      },
      (err) => {
        console.error("[Gamification] onSnapshot error:", err)
        if (isMounted) {
          setError(err.message || "Error loading gamification")
          setLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [user?.uid])

  // Refresh manual (para forzar re-read si onSnapshot tarda)
  const refresh = useCallback(async () => {
    if (!user?.uid) return
    try {
      const { getGamificationRaw, getFullGamificationState } = await import("@/lib/gamification/firebase-service")
      const rawData = await getGamificationRaw(user.uid)
      const fullState = await getFullGamificationState(user.uid)
      setRaw(rawData)
      setState(fullState)
    } catch (err: any) {
      console.error("[Gamification] Refresh error:", err)
    }
  }, [user?.uid])

  return { state, raw, numericCode, loading, error, refresh }
}
