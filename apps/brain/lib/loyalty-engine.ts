/**
 * lib/loyalty-engine.ts — Server-side loyalty engine
 *
 * ALL point movements go through this module.
 * Uses Firestore transactions for atomicity.
 * Every operation creates a ledger entry in loyalty_transactions.
 * Balance on customer_profiles is updated atomically within the same transaction.
 *
 * Key guarantees:
 * 1. Idempotency — duplicate calls with same idempotency key are no-ops
 * 2. Atomicity — balance + ledger entry + redemption are in one transaction
 * 3. Auditability — every point movement is recorded
 * 4. Consistency — balanceAfter is always correct
 *
 * Hardening (PR5-PR8):
 * PR5: orgId set on all new profiles, backfill-on-touch for legacy
 * PR6: Badge unlock is idempotent via createLoyaltyTx + arrayUnion
 * PR7: Redemption expiry enforced at validate/use time + batch sweep
 * PR8: Weekly quiz cap (300pts) enforced server-side, not bypassable from client
 */

import { db as adminDb, FieldValue } from "./firebase-admin"
// ── Inlined types (Vercel deploys standalone, @raiz/shared not available) ──

type LoyaltyTransactionType =
  | "earn.purchase" | "earn.quiz" | "earn.mission" | "earn.badge"
  | "earn.streak" | "earn.campaign" | "earn.referral" | "earn.manual"
  | "redeem.reward"
  | "reverse.purchase" | "reverse.redemption" | "reverse.manual"
  | "expire" | "correction"

type LoyaltyTransactionStatus = "completed" | "pending" | "reversed" | "failed"

type LoyaltySourceType =
  | "order" | "quiz" | "mission" | "badge" | "streak"
  | "campaign" | "redemption" | "admin" | "system"

interface LoyaltyTransaction {
  id?: string
  orgId: string
  uid: string
  type: LoyaltyTransactionType
  amount: number
  balanceAfter: number
  status: LoyaltyTransactionStatus
  sourceType: LoyaltySourceType
  sourceId: string
  idempotencyKey: string
  description: string
  descriptionEn?: string
  metadata?: Record<string, unknown>
  reversedByTxId?: string
  reversesOriginalTxId?: string
  actorId: string
  createdAt: string
  processedAt?: string
}

// ═══════════════════════════════════════════════════════════════
// CORE: Create a ledger transaction atomically
// ═══════════════════════════════════════════════════════════════

interface CreateTxParams {
  orgId: string
  uid: string
  type: LoyaltyTransactionType
  amount: number // positive = earn, negative = spend
  sourceType: LoyaltySourceType
  sourceId: string
  description: string
  descriptionEn?: string
  metadata?: Record<string, unknown>
  actorId: string
}

interface TxResult {
  success: boolean
  txId?: string
  balanceAfter?: number
  error?: string
  /** True if this was a duplicate (idempotency hit) */
  duplicate?: boolean
}

/**
 * Create a loyalty transaction within a Firestore transaction.
 * Guarantees:
 * - Idempotency via idempotencyKey check
 * - Atomic balance update on customer_profiles
 * - balanceAfter reflects the actual balance after this tx
 * - Cannot go below 0 for earn reversals or redeems
 */
export async function createLoyaltyTx(params: CreateTxParams): Promise<TxResult> {
  const idempotencyKey = `${params.type}:${params.sourceId}:${params.uid}`

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // 1. Check idempotency (atomic — uses tx.get on a dedicated doc keyed by idempotencyKey)
      const idempRef = adminDb.doc(`loyalty_idempotency/${idempotencyKey}`)
      const idempSnap = await tx.get(idempRef)

      if (idempSnap.exists) {
        const data = idempSnap.data()!
        return {
          success: true,
          txId: data.txId as string,
          balanceAfter: data.balanceAfter as number,
          duplicate: true,
        }
      }

      // 2. Read current balance
      const profileRef = adminDb.doc(`customer_profiles/${params.uid}`)
      const profileSnap = await tx.get(profileRef)
      const profileData = profileSnap.data() || {}
      const currentBalance = profileData.loyaltyPoints || 0
      const currentTotalEarned = profileData.totalPointsEarned || 0

      // 3. Calculate new balance
      const newBalance = currentBalance + params.amount
      if (newBalance < 0) {
        return { success: false, error: "INSUFFICIENT_BALANCE" }
      }

      // 4. Create ledger entry
      const now = new Date().toISOString()
      const txRef = adminDb.collection("loyalty_transactions").doc()
      const txData: LoyaltyTransaction = {
        orgId: params.orgId,
        uid: params.uid,
        type: params.type,
        amount: params.amount,
        balanceAfter: newBalance,
        status: "completed",
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        idempotencyKey,
        description: params.description,
        descriptionEn: params.descriptionEn,
        metadata: params.metadata || {},
        actorId: params.actorId,
        createdAt: now,
        processedAt: now,
      }

      tx.set(txRef, txData)

      // 5. Update balance cache on customer_profiles
      const balanceUpdate: Record<string, any> = {
        loyaltyPoints: newBalance,
        lastTxId: txRef.id,
        lastTxAt: now,
        updatedAt: now,
      }

      // Only increment totalPointsEarned for earn transactions
      if (params.amount > 0 && params.type.startsWith("earn.")) {
        balanceUpdate.totalPointsEarned = currentTotalEarned + params.amount
      }

      // Track totalPointsRedeemed for redeem transactions
      if (params.amount < 0 && params.type === "redeem.reward") {
        balanceUpdate.totalPointsRedeemed = (profileData.totalPointsRedeemed || 0) + Math.abs(params.amount)
      }

      if (profileSnap.exists) {
        // PR5: Ensure orgId is set on existing profiles (backfill on touch)
        if (!profileData.orgId) {
          balanceUpdate.orgId = params.orgId
        }
        tx.update(profileRef, balanceUpdate)
      } else {
        tx.set(profileRef, {
          id: params.uid,
          uid: params.uid,
          orgId: params.orgId, // PR5: Always set orgId on new profiles
          ...balanceUpdate,
          loyaltyPoints: newBalance,
          totalPointsEarned: params.amount > 0 ? params.amount : 0,
          totalPointsRedeemed: 0,
          completedMissions: [],
          unlockedBadges: [],
          completedQuizzes: [],
          streak: { currentStreak: 0, bestStreak: 0, lastActivityDate: "", weeklyStreak: 0 },
          uniqueProducts: 0,
          appOrders: 0,
          hasReusableCup: false,
          totalRedemptions: 0,
          createdAt: now,
        }, { merge: true })
      }

      // 6. Write idempotency guard (within same transaction)
      tx.set(idempRef, { txId: txRef.id, balanceAfter: newBalance, createdAt: now })

      return {
        success: true,
        txId: txRef.id,
        balanceAfter: newBalance,
      }
    })

    return result
  } catch (err: any) {
    console.error("[LoyaltyEngine] Transaction error:", err)
    return { success: false, error: err.message || "TRANSACTION_FAILED" }
  }
}

// ═══════════════════════════════════════════════════════════════
// AWARD: Points from purchase
// ═══════════════════════════════════════════════════════════════

interface AwardPurchaseParams {
  orgId: string
  uid: string
  orderId: string
  euroAmount: number
  source: "APP" | "POS"
  streakBonus?: number
  /** Product names for unique tracking */
  productNames?: string[]
  actorId: string
}

export async function awardPurchasePoints(params: AwardPurchaseParams): Promise<TxResult> {
  const basePoints = Math.floor(params.euroAmount * 100) // 1€ = 100 pts
  const streakBonus = params.streakBonus || 0
  const totalAmount = basePoints + streakBonus

  if (totalAmount <= 0) return { success: false, error: "ZERO_AMOUNT" }

  const result = await createLoyaltyTx({
    orgId: params.orgId,
    uid: params.uid,
    type: "earn.purchase",
    amount: totalAmount,
    sourceType: "order",
    sourceId: params.orderId,
    description: `Compra: ${params.euroAmount.toFixed(2)}€ → ${basePoints} pts${streakBonus ? ` + ${streakBonus} bonus racha` : ""}`,
    descriptionEn: `Purchase: €${params.euroAmount.toFixed(2)} → ${basePoints} pts${streakBonus ? ` + ${streakBonus} streak bonus` : ""}`,
    metadata: {
      euroAmount: params.euroAmount,
      basePoints,
      streakBonus,
      source: params.source,
      productNames: params.productNames,
    },
    actorId: params.actorId,
  })

  // Side effect: update unique products count (non-transactional, retry once)
  if (result.success && !result.duplicate && params.productNames?.length) {
    const profileRef = adminDb.doc(`customer_profiles/${params.uid}`)
    const sideEffectData = {
      knownProducts: FieldValue.arrayUnion(...params.productNames),
      uniqueProducts: FieldValue.increment(0), // will be reconciled by reading knownProducts length
      totalVisits: FieldValue.increment(1),
      ...(params.source === "APP" ? { appOrders: FieldValue.increment(1) } : {}),
    }
    try {
      await profileRef.update(sideEffectData)
    } catch (err) {
      console.warn("[LoyaltyEngine] Side-effect error updating products (attempt 1):", err)
      try {
        await profileRef.update(sideEffectData)
      } catch (retryErr) {
        console.error("[LoyaltyEngine] Side-effect FAILED after retry, flagging for reconciliation:", retryErr)
        await adminDb.collection("loyalty_side_effect_failures").add({
          orgId: params.orgId, uid: params.uid, txId: result.txId,
          effect: "update_products", failedAt: new Date().toISOString(),
        }).catch(() => {})
      }
    }
  }

  // Auto-complete any missions whose criteria were just met by this purchase
  // (non-blocking — errors are logged but don't fail the award).
  if (result.success && !result.duplicate) {
    reconcilePendingMissions({
      orgId: params.orgId,
      uid: params.uid,
      actorId: params.actorId,
    }).catch(err => console.warn("[LoyaltyEngine] reconcile after purchase failed:", err))
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// AWARD: Points from quiz completion
// ═══════════════════════════════════════════════════════════════

interface CompleteQuizParams {
  orgId: string
  uid: string
  quizId: string
  answers: number[]
  actorId: string
}

interface QuizCompleteResult extends TxResult {
  correctCount?: number
  totalQuestions?: number
  alreadyCompleted?: boolean
  newBadges?: string[]
  /** PR8: true if weekly quiz cap was applied */
  cappedByWeekly?: boolean
  /** PR8: actual points awarded after cap */
  pointsAwarded?: number
  /** PR8: user-facing cap message (es) */
  weeklyCapMessage?: string
  /** PR8: user-facing cap message (en) */
  weeklyCapMessageEn?: string
}

/**
 * PR8: Server-side weekly quiz cap.
 * Max points a user can earn from quizzes per week.
 * Week boundary: Monday 00:00 UTC (ISO week).
 */
const MAX_WEEKLY_QUIZ_POINTS = 600

/** Get ISO week start (Monday 00:00 UTC) for a given date */
function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setUTCDate(diff)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * PR8: Calculate how many quiz points a user has earned in the current week.
 * Source of truth: loyalty_transactions ledger (not client state).
 */
async function getWeeklyQuizPointsEarned(uid: string, orgId: string): Promise<number> {
  const weekStart = getWeekStart(new Date())

  const snap = await adminDb.collection("loyalty_transactions")
    .where("uid", "==", uid)
    .where("orgId", "==", orgId)
    .where("type", "==", "earn.quiz")
    .where("status", "==", "completed")
    .where("createdAt", ">=", weekStart)
    .get()

  let total = 0
  snap.forEach(doc => { total += doc.data().amount || 0 })
  return total
}

export async function completeQuizServer(params: CompleteQuizParams): Promise<QuizCompleteResult> {
  // 1. Fetch quiz definition from Firestore
  const quizSnap = await adminDb.doc(`orgs/${params.orgId}/quizzes/${params.quizId}`).get()
  if (!quizSnap.exists) {
    return { success: false, error: "QUIZ_NOT_FOUND" }
  }

  const quiz = quizSnap.data()!
  if (quiz.enabled === false) {
    return { success: false, error: "QUIZ_DISABLED" }
  }
  if (quiz.status === "draft" || quiz.status === "archived") {
    return { success: false, error: "QUIZ_NOT_PUBLISHED" }
  }

  // 2. Validate answers length
  const questions = quiz.questions || []
  if (params.answers.length !== questions.length) {
    return { success: false, error: "INVALID_ANSWERS_LENGTH" }
  }

  // PR8: Validate answer indices are within bounds (prevent injection of bad indices)
  for (let i = 0; i < params.answers.length; i++) {
    const ans = params.answers[i]
    if (typeof ans !== "number" || ans < 0 || ans >= (questions[i].options?.length || 4) || !Number.isInteger(ans)) {
      return { success: false, error: `INVALID_ANSWER_INDEX:${i}:${ans}` }
    }
  }

  // 3. Score — server-side, using quiz definition correctIndex
  let correctCount = 0
  for (let i = 0; i < questions.length; i++) {
    if (params.answers[i] === questions[i].correctIndex) correctCount++
  }

  // 4. Check if already completed (for "once" cadence quizzes)
  const profileSnap = await adminDb.doc(`customer_profiles/${params.uid}`).get()
  const profileData = profileSnap.data() || {}
  const completedQuizzes: string[] = profileData.completedQuizzes || []

  if (completedQuizzes.includes(params.quizId) && quiz.cadence === "once") {
    return {
      success: true,
      alreadyCompleted: true,
      correctCount,
      totalQuestions: questions.length,
    }
  }

  // 5. Determine points — server decides, client cannot pass arbitrary amounts
  const quizPoints = quiz.points || 0
  let pointsToAward = quizPoints
  let cappedByWeekly = false

  // PR8: Server-side weekly quiz cap enforcement
  if (pointsToAward > 0) {
    const weeklyEarned = await getWeeklyQuizPointsEarned(params.uid, params.orgId)

    if (weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS) {
      // Already at cap — log and reject points (quiz attempt still recorded)
      pointsToAward = 0
      cappedByWeekly = true

      logLoyaltyEvent(params.orgId, "gamification.quiz_cap_reached", {
        uid: params.uid,
        quizId: params.quizId,
        weeklyEarned,
        maxWeekly: MAX_WEEKLY_QUIZ_POINTS,
        attemptedPoints: quizPoints,
      })
    } else if (weeklyEarned + pointsToAward > MAX_WEEKLY_QUIZ_POINTS) {
      // Partial cap — award only the remaining allowance
      const original = pointsToAward
      pointsToAward = MAX_WEEKLY_QUIZ_POINTS - weeklyEarned
      cappedByWeekly = true

      logLoyaltyEvent(params.orgId, "gamification.quiz_points_blocked", {
        uid: params.uid,
        quizId: params.quizId,
        weeklyEarned,
        maxWeekly: MAX_WEEKLY_QUIZ_POINTS,
        requestedPoints: original,
        awardedPoints: pointsToAward,
        truncated: original - pointsToAward,
      })
    }
  }

  // 6. Award points via ledger (0 points = skip ledger, but still record attempt)
  let txResult: TxResult = { success: true }

  if (pointsToAward > 0) {
    txResult = await createLoyaltyTx({
      orgId: params.orgId,
      uid: params.uid,
      type: "earn.quiz",
      amount: pointsToAward,
      sourceType: "quiz",
      sourceId: params.quizId,
      description: `Quiz: ${quiz.title}${cappedByWeekly ? " (cap semanal)" : ""}`,
      descriptionEn: quiz.titleEn ? `Quiz: ${quiz.titleEn}${cappedByWeekly ? " (weekly cap)" : ""}` : undefined,
      metadata: {
        correctCount,
        totalQuestions: questions.length,
        score: correctCount / questions.length,
        originalPoints: quizPoints,
        cappedByWeekly,
      },
      actorId: params.actorId,
    })
  }

  if (!txResult.success && !txResult.duplicate) {
    return { ...txResult, correctCount, totalQuestions: questions.length }
  }

  // 7. Mark quiz as completed on profile (side effect, retry once)
  {
    const profileRef = adminDb.doc(`customer_profiles/${params.uid}`)
    const quizUpdate = {
      completedQuizzes: FieldValue.arrayUnion(params.quizId),
      updatedAt: new Date().toISOString(),
    }
    try {
      await profileRef.update(quizUpdate)
    } catch (err) {
      console.warn("[LoyaltyEngine] Error marking quiz completed (attempt 1):", err)
      try {
        await profileRef.update(quizUpdate)
      } catch (retryErr) {
        console.error("[LoyaltyEngine] Quiz completion side-effect FAILED after retry:", retryErr)
        await adminDb.collection("loyalty_side_effect_failures").add({
          orgId: params.orgId, uid: params.uid, txId: txResult.txId,
          effect: "mark_quiz_completed", quizId: params.quizId, failedAt: new Date().toISOString(),
        }).catch(() => {})
      }
    }
  }

  // 8. Record quiz attempt (always, even if cap blocked points)
  try {
    await adminDb.collection("quiz_attempts").add({
      orgId: params.orgId,
      uid: params.uid,
      quizId: params.quizId,
      answers: params.answers,
      correctCount,
      totalQuestions: questions.length,
      pointsAwarded: txResult.duplicate ? 0 : pointsToAward,
      isFirstAttempt: !completedQuizzes.includes(params.quizId),
      loyaltyTxId: txResult.txId || null,
      cappedByWeekly,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn("[LoyaltyEngine] Error recording quiz attempt:", err)
  }

  // 9. Check badges (best-effort, non-blocking)
  let newBadges: string[] = []
  try {
    newBadges = await checkAndAwardBadges(params.orgId, params.uid, params.actorId)
  } catch {
    // non-blocking
  }

  // 9b. Reconcile pending missions (quiz may have unlocked quiz_complete criteria)
  try {
    const rec = await reconcilePendingMissions({
      orgId: params.orgId,
      uid: params.uid,
      actorId: params.actorId,
    })
    if (rec.newBadges.length > 0) {
      newBadges = Array.from(new Set([...newBadges, ...rec.newBadges]))
    }
  } catch (err) {
    console.warn("[LoyaltyEngine] reconcile after quiz failed:", err)
  }

  // 10. Log event
  logLoyaltyEvent(params.orgId, "gamification.quiz_completed", {
    uid: params.uid,
    quizId: params.quizId,
    points: pointsToAward,
    originalPoints: quizPoints,
    correctCount,
    totalQuestions: questions.length,
    cappedByWeekly,
  })

  return {
    ...txResult,
    correctCount,
    totalQuestions: questions.length,
    newBadges,
    // PR8: Tell frontend about cap status
    ...(cappedByWeekly ? {
      cappedByWeekly: true,
      pointsAwarded: pointsToAward,
      weeklyCapMessage: pointsToAward === 0
        ? "Has alcanzado el máximo semanal de puntos por quizzes"
        : `Cap semanal aplicado: ${pointsToAward} de ${quizPoints} puntos otorgados`,
      weeklyCapMessageEn: pointsToAward === 0
        ? "You've reached the weekly quiz points limit"
        : `Weekly cap applied: ${pointsToAward} of ${quizPoints} points awarded`,
    } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
// AWARD: Points from mission completion
// ═══════════════════════════════════════════════════════════════

interface CompleteMissionParams {
  orgId: string
  uid: string
  missionId: string
  actorId: string
}

export async function completeMissionServer(params: CompleteMissionParams): Promise<TxResult & { newBadges?: string[] }> {
  // 1. Fetch mission
  const missionSnap = await adminDb.doc(`orgs/${params.orgId}/missions/${params.missionId}`).get()
  if (!missionSnap.exists) {
    return { success: false, error: "MISSION_NOT_FOUND" }
  }

  const mission = missionSnap.data()!
  if (mission.enabled === false) {
    return { success: false, error: "MISSION_DISABLED" }
  }

  // 2. Check not already completed
  const profileSnap = await adminDb.doc(`customer_profiles/${params.uid}`).get()
  const profileData = profileSnap.data() || {}
  const completedMissions: string[] = profileData.completedMissions || []

  if (completedMissions.includes(params.missionId)) {
    return { success: true, duplicate: true }
  }

  // 3. Validate criteria (server-side check of actual progress)
  const criteria = mission.criteria || []
  for (const criterion of criteria) {
    const actual = getMissionCriterionProgress(criterion, profileData)
    if (actual < criterion.target) {
      return { success: false, error: `CRITERION_NOT_MET:${criterion.type}:${actual}/${criterion.target}` }
    }
  }

  // 4. Check prerequisite mission
  if (mission.requiresMissionId && !completedMissions.includes(mission.requiresMissionId)) {
    return { success: false, error: "PREREQUISITE_NOT_MET" }
  }

  // 5. Award points via ledger
  const reward = mission.reward || 0
  let txResult: TxResult = { success: true }

  if (reward > 0) {
    txResult = await createLoyaltyTx({
      orgId: params.orgId,
      uid: params.uid,
      type: "earn.mission",
      amount: reward,
      sourceType: "mission",
      sourceId: params.missionId,
      description: `Misión: ${mission.title}`,
      descriptionEn: mission.titleEn ? `Mission: ${mission.titleEn}` : undefined,
      metadata: { missionId: params.missionId, category: mission.category },
      actorId: params.actorId,
    })
  }

  if (!txResult.success) return txResult

  // 6. Mark mission completed (retry once)
  {
    const missionUpdate = {
      completedMissions: FieldValue.arrayUnion(params.missionId),
      updatedAt: new Date().toISOString(),
    }
    try {
      await adminDb.doc(`customer_profiles/${params.uid}`).update(missionUpdate)
    } catch (err) {
      console.warn("[LoyaltyEngine] Error marking mission completed (attempt 1):", err)
      try {
        await adminDb.doc(`customer_profiles/${params.uid}`).update(missionUpdate)
      } catch (retryErr) {
        console.error("[LoyaltyEngine] Mission completion side-effect FAILED after retry:", retryErr)
        await adminDb.collection("loyalty_side_effect_failures").add({
          orgId: params.orgId, uid: params.uid, txId: txResult.txId,
          effect: "mark_mission_completed", missionId: params.missionId, failedAt: new Date().toISOString(),
        }).catch(() => {})
      }
    }
  }

  // 7. Record completion
  try {
    await adminDb.collection("mission_completions").add({
      orgId: params.orgId,
      uid: params.uid,
      missionId: params.missionId,
      pointsAwarded: txResult.duplicate ? 0 : reward,
      badgeUnlocked: mission.badgeId || null,
      loyaltyTxId: txResult.txId || null,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn("[LoyaltyEngine] Error recording mission completion:", err)
  }

  // 8. Badges
  let newBadges: string[] = []
  try {
    newBadges = await checkAndAwardBadges(params.orgId, params.uid, params.actorId)
  } catch { /* non-blocking */ }

  logLoyaltyEvent(params.orgId, "gamification.mission_completed", {
    uid: params.uid,
    missionId: params.missionId,
    reward,
  })

  return { ...txResult, newBadges }
}

// ═══════════════════════════════════════════════════════════════
// RECONCILE: Auto-complete all pending missions for a user
// ═══════════════════════════════════════════════════════════════

interface ReconcileMissionsParams {
  orgId: string
  uid: string
  actorId: string
}

export interface ReconcileMissionsResult {
  success: boolean
  completedMissionIds: string[]
  totalAwarded: number
  newBadges: string[]
  errors?: Array<{ missionId: string; error: string }>
}

/**
 * Iterates through all enabled missions in the org and completes those whose
 * criteria are already met but haven't been registered in the user's
 * completedMissions yet. Intended to be called:
 *   - When the app opens (drift recovery)
 *   - After purchases / quiz completions (chain reaction for cascaded missions)
 *
 * Uses completeMissionServer under the hood, which handles idempotency,
 * ledger writes, badge checks and prerequisite validation.
 *
 * Safe to call repeatedly: already-completed missions are skipped and
 * createLoyaltyTx has idempotency keys to prevent double-awarding.
 */
export async function reconcilePendingMissions(
  params: ReconcileMissionsParams,
): Promise<ReconcileMissionsResult> {
  const result: ReconcileMissionsResult = {
    success: true,
    completedMissionIds: [],
    totalAwarded: 0,
    newBadges: [],
    errors: [],
  }

  // 1. Load user profile once
  const profileSnap = await adminDb.doc(`customer_profiles/${params.uid}`).get()
  if (!profileSnap.exists) {
    return { ...result, success: false, errors: [{ missionId: "*", error: "PROFILE_NOT_FOUND" }] }
  }
  const profileData = profileSnap.data() || {}
  const completedMissions = new Set<string>(profileData.completedMissions || [])

  // 2. Load all missions for the org (priority order to resolve prereq chains first)
  const missionsSnap = await adminDb
    .collection(`orgs/${params.orgId}/missions`)
    .orderBy("priority", "asc")
    .get()

  // 3. Iterate — multiple passes so missions with prerequisites that were just
  //    unlocked in this reconciliation can also complete in the same call.
  let madeProgress = true
  let passes = 0
  const MAX_PASSES = 3
  const newBadgesSet = new Set<string>()

  while (madeProgress && passes < MAX_PASSES) {
    madeProgress = false
    passes += 1

    for (const doc of missionsSnap.docs) {
      const missionId = doc.id
      if (completedMissions.has(missionId)) continue

      const mission = doc.data() as Record<string, any>
      if (mission.enabled === false) continue

      // Prereq?
      if (mission.requiresMissionId && !completedMissions.has(mission.requiresMissionId)) continue

      // Criteria?
      const criteria = (mission.criteria || []) as Array<{ type: string; target: number }>
      const allMet = criteria.every(
        c => getMissionCriterionProgress(c, profileData) >= c.target,
      )
      if (!allMet) continue

      // Complete it
      const outcome = await completeMissionServer({
        orgId: params.orgId,
        uid: params.uid,
        missionId,
        actorId: params.actorId,
      })

      if (outcome.success && !outcome.duplicate) {
        completedMissions.add(missionId)
        result.completedMissionIds.push(missionId)
        result.totalAwarded += (mission.reward || 0)
        madeProgress = true
        ;(outcome.newBadges || []).forEach(b => newBadgesSet.add(b))
      } else if (outcome.success && outcome.duplicate) {
        // Already completed server-side in a race — just mark as done locally
        completedMissions.add(missionId)
      } else if (!outcome.success) {
        // Don't fail the whole reconcile if one mission errors
        result.errors!.push({ missionId, error: outcome.error || "UNKNOWN" })
      }
    }
  }

  result.newBadges = Array.from(newBadgesSet)
  if (result.errors!.length === 0) delete result.errors
  return result
}

// ═══════════════════════════════════════════════════════════════
// REDEEM: Reward redemption
// ═══════════════════════════════════════════════════════════════

interface RedeemParams {
  orgId: string
  uid: string
  rewardId: string
  actorId: string
  idempotencyKey?: string
}

interface RedeemResult extends TxResult {
  code?: string
  redemptionId?: string
}

export async function redeemRewardServer(params: RedeemParams): Promise<RedeemResult> {
  // 1. Fetch reward
  const rewardSnap = await adminDb.doc(`orgs/${params.orgId}/rewards_catalog/${params.rewardId}`).get()
  if (!rewardSnap.exists) {
    return { success: false, error: "REWARD_NOT_FOUND" }
  }

  const reward = rewardSnap.data()!
  // Strict check: reward must be explicitly enabled (true), not just "not false"
  if (reward.enabled !== true) {
    return { success: false, error: "REWARD_DISABLED" }
  }
  if (reward.status === "draft" || reward.status === "archived") {
    return { success: false, error: "REWARD_NOT_PUBLISHED" }
  }

  const pointsCost = reward.pointsCost || 0
  if (pointsCost <= 0) {
    return { success: false, error: "INVALID_COST" }
  }

  // 2. Generate code
  const code = generateRedemptionCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48h

  // 3. Atomic: debit points + create redemption + create ledger entry
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // Check idempotency — use caller-provided key or generate unique per request
      // Prevents duplicate processing while allowing multiple redemptions of the same reward
      const idempKey = params.idempotencyKey || `redeem.reward:${params.rewardId}:${params.uid}:${now.getTime()}`

      // Check idempotency (atomic — uses tx.get on a dedicated doc)
      const idempRef = adminDb.doc(`loyalty_idempotency/${idempKey}`)
      const idempSnap = await tx.get(idempRef)

      if (idempSnap.exists) {
        return { success: true, duplicate: true, code: "", redemptionId: "" }
      }

      // Read balance
      const profileRef = adminDb.doc(`customer_profiles/${params.uid}`)
      const profileSnap = await tx.get(profileRef)
      const profileData = profileSnap.data() || {}
      const currentBalance = profileData.loyaltyPoints || 0

      if (currentBalance < pointsCost) {
        return { success: false, error: "INSUFFICIENT_BALANCE" }
      }

      const newBalance = currentBalance - pointsCost

      // Create ledger entry
      const txRef = adminDb.collection("loyalty_transactions").doc()
      tx.set(txRef, {
        orgId: params.orgId,
        uid: params.uid,
        type: "redeem.reward",
        amount: -pointsCost,
        balanceAfter: newBalance,
        status: "completed",
        sourceType: "redemption",
        sourceId: params.rewardId,
        idempotencyKey: idempKey,
        description: `Canje: ${reward.name}`,
        descriptionEn: reward.nameEn ? `Redemption: ${reward.nameEn}` : undefined,
        metadata: { rewardId: params.rewardId, code, pointsCost },
        actorId: params.actorId,
        createdAt: now.toISOString(),
        processedAt: now.toISOString(),
      })

      // Create redemption record
      const redemptionRef = adminDb.collection("redemptions").doc()
      tx.set(redemptionRef, {
        orgId: params.orgId,
        uid: params.uid,
        rewardId: params.rewardId,
        rewardName: reward.name,
        rewardNameEn: reward.nameEn || null,
        pointsSpent: pointsCost,
        code,
        status: "pending",
        loyaltyTxId: txRef.id,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      })

      // Update balance
      tx.update(profileRef, {
        loyaltyPoints: newBalance,
        totalPointsRedeemed: (profileData.totalPointsRedeemed || 0) + pointsCost,
        totalRedemptions: (profileData.totalRedemptions || 0) + 1,
        lastTxId: txRef.id,
        lastTxAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })

      // If reusable cup, mark
      if (params.rewardId === "reusable-cup") {
        tx.update(profileRef, { hasReusableCup: true })
      }

      // Write idempotency guard (within same transaction)
      tx.set(idempRef, { txId: txRef.id, balanceAfter: newBalance, createdAt: now.toISOString() })

      return {
        success: true,
        txId: txRef.id,
        balanceAfter: newBalance,
        code,
        redemptionId: redemptionRef.id,
      }
    })

    if (result.success && !result.duplicate) {
      logLoyaltyEvent(params.orgId, "rewards.redeemed", {
        uid: params.uid,
        rewardId: params.rewardId,
        pointsCost,
        code,
      })
    }

    return result
  } catch (err: any) {
    console.error("[LoyaltyEngine] Redeem transaction error:", err)
    return { success: false, error: err.message || "TRANSACTION_FAILED" }
  }
}

// ═══════════════════════════════════════════════════════════════
// PR7: REDEMPTION EXPIRY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * PR7: Validate a redemption for use (called from POS or Brain API).
 * Enforces expiry at use-time. Returns the redemption if valid.
 */
export async function validateRedemptionForUse(code: string, orgId: string): Promise<{
  valid: boolean
  redemption?: any
  error?: string
  redemptionId?: string
}> {
  if (!code || code.length !== 6) {
    return { valid: false, error: "INVALID_CODE_FORMAT" }
  }

  const snap = await adminDb.collection("redemptions")
    .where("code", "==", code.toUpperCase())
    .where("orgId", "==", orgId) // PR5: scoped by org
    .where("status", "==", "pending")
    .limit(1)
    .get()

  if (snap.empty) {
    return { valid: false, error: "CODE_NOT_FOUND_OR_ALREADY_USED" }
  }

  const docSnap = snap.docs[0]
  const data = docSnap.data()

  // PR7: Enforce expiry at use-time
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
  if (expiresAt && expiresAt < new Date()) {
    // Auto-transition to expired status
    await adminDb.doc(`redemptions/${docSnap.id}`).update({
      status: "expired",
      expiredAt: new Date().toISOString(),
    })

    logLoyaltyEvent(orgId, "rewards.redemption_expired", {
      uid: data.uid,
      redemptionId: docSnap.id,
      rewardId: data.rewardId,
      code: data.code,
      expiresAt: data.expiresAt,
      reason: "expired_at_use_time",
    })

    return { valid: false, error: "REDEMPTION_EXPIRED", redemptionId: docSnap.id }
  }

  return { valid: true, redemption: { id: docSnap.id, ...data }, redemptionId: docSnap.id }
}

/**
 * PR7: Mark a validated redemption as used (server-side, atomic).
 * Must be called after validateRedemptionForUse().
 */
export async function markRedemptionUsedServer(
  redemptionId: string,
  orgId: string,
  actorId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = adminDb.doc(`redemptions/${redemptionId}`)
    const snap = await ref.get()
    if (!snap.exists) return { success: false, error: "REDEMPTION_NOT_FOUND" }

    const data = snap.data()!
    if (data.status !== "pending") {
      return { success: false, error: `INVALID_STATUS:${data.status}` }
    }
    if (data.orgId !== orgId) {
      return { success: false, error: "ORG_MISMATCH" }
    }

    // PR7: Double-check expiry one more time
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
    if (expiresAt && expiresAt < new Date()) {
      await ref.update({ status: "expired", expiredAt: new Date().toISOString() })

      logLoyaltyEvent(orgId, "rewards.redemption_use_rejected", {
        uid: data.uid,
        redemptionId,
        rewardId: data.rewardId,
        reason: "expired",
      })

      return { success: false, error: "REDEMPTION_EXPIRED" }
    }

    await ref.update({
      status: "used",
      usedAt: new Date().toISOString(),
      usedByActorId: actorId,
    })

    logLoyaltyEvent(orgId, "rewards.redemption_used", {
      uid: data.uid,
      redemptionId,
      rewardId: data.rewardId,
      code: data.code,
      pointsSpent: data.pointsSpent,
      actorId,
    })

    return { success: true }
  } catch (err: any) {
    console.error("[LoyaltyEngine] markRedemptionUsed error:", err)
    return { success: false, error: err.message || "UNKNOWN_ERROR" }
  }
}

/**
 * PR7: Batch-expire all pending redemptions past their expiresAt.
 * Called by admin endpoint or scheduled job.
 * Returns count of expired redemptions.
 */
export async function expireStaleRedemptions(orgId: string): Promise<{
  expired: number
  errors: number
}> {
  const now = new Date().toISOString()
  const snap = await adminDb.collection("redemptions")
    .where("orgId", "==", orgId)
    .where("status", "==", "pending")
    .get()

  let expired = 0
  let errors = 0
  const batch = adminDb.batch()
  const MAX_BATCH = 500

  for (const doc of snap.docs) {
    if (expired >= MAX_BATCH) break
    const data = doc.data()
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null

    if (expiresAt && expiresAt < new Date()) {
      batch.update(doc.ref, {
        status: "expired",
        expiredAt: now,
      })
      expired++
    }
  }

  if (expired > 0) {
    try {
      await batch.commit()
      // Log single summary event
      logLoyaltyEvent(orgId, "rewards.batch_expired", {
        count: expired,
        timestamp: now,
      })
    } catch (err) {
      console.error("[LoyaltyEngine] Batch expire error:", err)
      errors = expired
      expired = 0
    }
  }

  return { expired, errors }
}

// ═══════════════════════════════════════════════════════════════
// REVERSE: Cancel/reverse a transaction
// ═══════════════════════════════════════════════════════════════

interface ReverseParams {
  orgId: string
  uid: string
  originalTxId: string
  reason: string
  actorId: string
}

export async function reverseTransaction(params: ReverseParams): Promise<TxResult> {
  // 1. Read original transaction
  const originalSnap = await adminDb.doc(`loyalty_transactions/${params.originalTxId}`).get()
  if (!originalSnap.exists) {
    return { success: false, error: "ORIGINAL_TX_NOT_FOUND" }
  }

  const original = originalSnap.data() as LoyaltyTransaction
  if (original.uid !== params.uid) {
    return { success: false, error: "UID_MISMATCH" }
  }
  if (original.status === "reversed") {
    return { success: true, duplicate: true }
  }
  // Prevent reversing a reversal (creates confusion)
  if (original.type.startsWith("reverse.")) {
    return { success: false, error: "CANNOT_REVERSE_REVERSAL" }
  }
  // Prevent reversing a correction
  if (original.type === "correction") {
    return { success: false, error: "CANNOT_REVERSE_CORRECTION" }
  }

  // 2. Create reversal (negate the amount)
  const reverseAmount = -original.amount
  const reverseType: LoyaltyTransactionType = original.type.startsWith("earn.")
    ? "reverse.purchase"
    : original.type === "redeem.reward"
      ? "reverse.redemption"
      : "reverse.manual"

  const result = await createLoyaltyTx({
    orgId: params.orgId,
    uid: params.uid,
    type: reverseType,
    amount: reverseAmount,
    sourceType: "system",
    sourceId: params.originalTxId,
    description: `Reverso: ${params.reason}`,
    descriptionEn: `Reversal: ${params.reason}`,
    metadata: {
      originalTxId: params.originalTxId,
      originalType: original.type,
      originalAmount: original.amount,
      reason: params.reason,
    },
    actorId: params.actorId,
  })

  // 3. Mark original as reversed
  if (result.success && !result.duplicate) {
    await adminDb.doc(`loyalty_transactions/${params.originalTxId}`).update({
      status: "reversed",
      reversedByTxId: result.txId,
    })

    logLoyaltyEvent(params.orgId, "loyalty.points_reversed" as any, {
      uid: params.uid,
      originalTxId: params.originalTxId,
      amount: reverseAmount,
      reason: params.reason,
    })
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function generateRedemptionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function getMissionCriterionProgress(
  criterion: { type: string; target: number },
  profileData: Record<string, any>,
): number {
  switch (criterion.type) {
    case "quiz_complete":
      return (profileData.completedQuizzes || []).length
    case "purchase_count":
    case "first_purchase":
      return profileData.totalVisits || 0
    case "unique_products":
      return profileData.uniqueProducts || 0
    case "order_ahead":
      return profileData.appOrders || 0
    case "streak_days":
      return profileData.streak?.weeklyStreak || 0
    case "reusable_cup":
      return profileData.hasReusableCup ? 1 : 0
    case "spend_amount":
      return profileData.totalSpent || 0
    default:
      return 0
  }
}

/**
 * PR6: Atomic badge checking — prevents race condition.
 *
 * Strategy:
 * 1. createLoyaltyTx already has idempotency key "earn.badge:{badgeId}:{uid}"
 *    so double-awarding points is impossible (returns duplicate: true).
 * 2. We re-read unlockedBadges inside each badge attempt to catch concurrent writes.
 * 3. arrayUnion is inherently idempotent (adding same element twice = no-op).
 *
 * Net effect: even if two requests enter this function simultaneously,
 * at most one will award points (idempotency key), and the badge array
 * will never contain duplicates (arrayUnion guarantee).
 */
async function checkAndAwardBadges(orgId: string, uid: string, actorId: string): Promise<string[]> {
  const profileSnap = await adminDb.doc(`customer_profiles/${uid}`).get()
  const data = profileSnap.data() || {}
  const already = new Set<string>(data.unlockedBadges || [])
  const newBadges: string[] = []

  const checks: Array<{ id: string; condition: boolean }> = [
    { id: "first-sip", condition: (data.totalVisits || 0) >= 1 },
    { id: "flavor-explorer", condition: (data.uniqueProducts || 0) >= 5 },
    { id: "menu-master", condition: (data.uniqueProducts || 0) >= 10 },
    { id: "weekly-ritual", condition: (data.streak?.weeklyStreak || 0) >= 4 },
    { id: "loyal-regular", condition: (data.totalVisits || 0) >= 25 },
    { id: "curious-mind", condition: (data.completedQuizzes || []).length >= 1 },
    { id: "coffee-scholar", condition: ["welcome-profile", "welcome-specialty"].every(id => (data.completedQuizzes || []).includes(id)) },
    { id: "coffee-expert", condition: (data.completedQuizzes || []).length >= 8 },
    { id: "green-choice", condition: !!data.hasReusableCup },
    { id: "first-redeem", condition: (data.totalRedemptions || 0) >= 1 },
    { id: "order-ahead-pro", condition: (data.appOrders || 0) >= 3 },
  ]

  const badgeBonuses: Record<string, number> = {
    "first-sip": 100, "flavor-explorer": 300, "menu-master": 600,
    "weekly-ritual": 400, "loyal-regular": 1000, "curious-mind": 100,
    "coffee-scholar": 400, "coffee-expert": 800, "green-choice": 300,
    "first-redeem": 100, "order-ahead-pro": 300,
  }

  for (const { id, condition } of checks) {
    if (!condition || already.has(id)) continue

    // PR6: Award bonus via ledger — idempotency key prevents double-award
    const bonus = badgeBonuses[id] || 0
    let awarded = false

    if (bonus > 0) {
      const txResult = await createLoyaltyTx({
        orgId,
        uid,
        type: "earn.badge",
        amount: bonus,
        sourceType: "badge",
        sourceId: id,
        description: `Badge: ${id}`,
        actorId,
      })
      // Only count as "new" if not a duplicate
      awarded = txResult.success && !txResult.duplicate
    } else {
      awarded = true
    }

    // PR6: arrayUnion is idempotent — safe even if concurrent request already added it
    await adminDb.doc(`customer_profiles/${uid}`).update({
      unlockedBadges: FieldValue.arrayUnion(id),
    })

    if (awarded) {
      newBadges.push(id)
      // Log badge unlock event
      logLoyaltyEvent(orgId, "gamification.badge_unlocked", {
        uid, badgeId: id, bonusPoints: bonus,
      })
    }
  }

  return newBadges
}

/** Fire-and-forget event logging with standardized shape */
function logLoyaltyEvent(orgId: string, type: string, data: Record<string, unknown>) {
  const now = new Date().toISOString()
  adminDb.collection(`orgs/${orgId}/events`).add({
    type,
    source: "SYSTEM",
    tier: type.startsWith("loyalty.") || type.startsWith("gamification.") || type.startsWith("rewards.")
      ? "domain" : "analytics",
    orgId,
    uid: data.uid || null,
    data,
    timestamp: now,
    idempotencyKey: data.txId ? `event:${type}:${data.txId}` : null,
  }).catch(err => console.warn("[LoyaltyEngine] Event log error:", err))
}
