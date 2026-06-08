import { RAIZ_ORG_ID } from "@/lib/tenant";
/**
 * server-loyalty.ts (APP)
 *
 * Client-side helper that routes loyalty operations through the Brain server API
 * instead of writing directly to Firestore. This ensures:
 * - Atomic transactions (no race conditions)
 * - Server-side validation (no client manipulation)
 * - Idempotent operations (no double-spends)
 * - Full audit trail in loyalty_transactions ledger
 *
 * Feature flag: NEXT_PUBLIC_USE_SERVER_LOYALTY
 * When "true", all loyalty operations go through Brain API.
 * When absent/false, falls back to legacy client-side Firestore writes.
 */

import { auth } from "./firebase"

// ── Feature flag ──

export function useServerLoyalty(): boolean {
  return process.env.NEXT_PUBLIC_USE_SERVER_LOYALTY === "true"
}

// ── Config ──

const ORG_ID = RAIZ_ORG_ID

function getBrainBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BRAIN_API_URL || "/api"
}

// ── Auth helper ──

/**
 * Note: This function uses auth.currentUser from the client-side Firebase SDK.
 * It will only work in browser contexts (client components).
 * If called from a server context, auth.currentUser will be null.
 * This module is designed for client-side use only, despite its "server-loyalty" name.
 */
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  try {
    return await user.getIdToken()
  } catch {
    return null
  }
}

// ── Generic fetch helper ──

interface ServerResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

async function loyaltyFetch<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<ServerResponse<T>> {
  const token = await getAuthToken()
  if (!token) return { ok: false, error: "No autenticado" }

  const base = getBrainBaseUrl()
  const url = `${base}/org/${ORG_ID}/loyalty/${endpoint}`

  // Set 5-second timeout for Brain API calls to prevent hanging requests
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      ...(body && method === "POST" ? { body: JSON.stringify(body) } : {}),
    })

    const json = await res.json()

    if (!res.ok) {
      return { ok: false, error: json.error || `HTTP ${res.status}` }
    }

    return { ok: true, data: json as T }
  } catch (err) {
    console.error(`[ServerLoyalty] ${endpoint} failed:`, err)
    return { ok: false, error: "Error de conexión" }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Award points (purchase) ──

export interface AwardResult {
  txId: string
  balanceAfter: number
  streakBonus: number
}

export async function serverAwardPoints(
  uid: string,
  orderId: string,
  euroAmount: number,
  productNames?: string[],
): Promise<ServerResponse<AwardResult>> {
  return loyaltyFetch<AwardResult>("award", "POST", {
    uid,
    orderId,
    euroAmount,
    productNames,
  })
}

// ── Redeem reward ──

export interface RedeemResult {
  txId: string
  code: string
  redemptionId: string
  balanceAfter: number
}

export async function serverRedeemReward(
  uid: string,
  rewardId: string,
): Promise<ServerResponse<RedeemResult>> {
  return loyaltyFetch<RedeemResult>("redeem", "POST", {
    uid,
    rewardId,
  })
}

// ── Complete quiz ──

export interface QuizCompleteResult {
  txId: string
  score: number
  totalQuestions: number
  pointsAwarded: number
  balanceAfter: number
  alreadyCompleted?: boolean
  newBadges?: string[]
}

export async function serverCompleteQuiz(
  uid: string,
  quizId: string,
  answers: number[],
): Promise<ServerResponse<QuizCompleteResult>> {
  return loyaltyFetch<QuizCompleteResult>("quiz-complete", "POST", {
    uid,
    quizId,
    answers,
  })
}

// ── Complete mission ──

export interface MissionCompleteResult {
  txId: string
  pointsAwarded: number
  balanceAfter: number
  newBadges?: string[]
}

export async function serverCompleteMission(
  uid: string,
  missionId: string,
): Promise<ServerResponse<MissionCompleteResult>> {
  return loyaltyFetch<MissionCompleteResult>("mission-complete", "POST", {
    uid,
    missionId,
  })
}

// ── Reconcile pending missions (evaluate & auto-complete all eligible) ──

export interface MissionsReconcileResult {
  success: boolean
  completedMissionIds: string[]
  totalAwarded: number
  newBadges: string[]
  errors?: Array<{ missionId: string; error: string }>
}

export async function serverReconcileMissions(
  uid: string,
): Promise<ServerResponse<MissionsReconcileResult>> {
  return loyaltyFetch<MissionsReconcileResult>("missions-reconcile", "POST", { uid })
}

// ── Get balance + history ──

export interface BalanceResult {
  balance: number
  totalEarned: number
  totalRedeemed: number
  recentTransactions: unknown[]
  activeRedemptions: unknown[]
}

export async function serverGetBalance(
  uid: string,
): Promise<ServerResponse<BalanceResult>> {
  return loyaltyFetch<BalanceResult>(`balance?uid=${uid}`, "GET")
}
