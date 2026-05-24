/**
 * types/loyalty.ts — Loyalty Ledger and Transaction System
 *
 * The loyalty_transactions collection is the single source of truth for points.
 * customer_profiles.loyaltyPoints is a cached derived balance for fast reads.
 * The ledger enables: audit, reversal, expiration, reconciliation.
 *
 * Collection: orgs/{orgId}/loyalty_transactions
 * or root: loyalty_transactions (with orgId field)
 */

// ═══════════════════════════════════════════════════════════════
// TRANSACTION TYPES
// ═══════════════════════════════════════════════════════════════

/** Every possible reason for points moving */
export type LoyaltyTransactionType =
  | "earn.purchase"         // Points earned from a purchase
  | "earn.quiz"             // Points earned from completing a quiz
  | "earn.mission"          // Points earned from completing a mission
  | "earn.badge"            // Bonus points from unlocking a badge
  | "earn.streak"           // Bonus points from streak
  | "earn.campaign"         // Points from a promotional campaign
  | "earn.referral"         // Points from referring someone
  | "earn.manual"           // Manual adjustment by admin
  | "redeem.reward"         // Points spent on a reward
  | "reverse.purchase"      // Reversal of purchase earn (order cancelled)
  | "reverse.redemption"    // Reversal of a redemption (reward returned)
  | "reverse.manual"        // Manual reversal by admin
  | "expire"                // Points expired (future use)
  | "correction"            // Balance correction/reconciliation

export type LoyaltyTransactionStatus =
  | "completed"             // Successfully processed
  | "pending"               // Awaiting processing
  | "reversed"              // Has been reversed
  | "failed"                // Processing failed

/** What originated this transaction */
export type LoyaltySourceType =
  | "order"                 // A customer order
  | "quiz"                  // A quiz completion
  | "mission"               // A mission completion
  | "badge"                 // A badge unlock
  | "streak"                // A streak milestone
  | "campaign"              // A promotional campaign
  | "redemption"            // A reward redemption
  | "admin"                 // Admin manual action
  | "system"                // System process (expiration, correction)

// ═══════════════════════════════════════════════════════════════
// MAIN ENTITY: LoyaltyTransaction
// ═══════════════════════════════════════════════════════════════

export interface LoyaltyTransaction {
  id?: string

  /** Organization that owns this transaction */
  orgId: string

  /** Customer uid */
  uid: string

  /** Type of transaction */
  type: LoyaltyTransactionType

  /**
   * Signed amount: positive = earn, negative = spend/reverse.
   * This is the ONLY field that changes the balance.
   */
  amount: number

  /**
   * Running balance AFTER this transaction.
   * Enables fast point-in-time balance lookup.
   * Set by the server at write time.
   */
  balanceAfter: number

  /** Current status */
  status: LoyaltyTransactionStatus

  /** What triggered this transaction */
  sourceType: LoyaltySourceType

  /**
   * ID of the source entity (orderId, quizId, missionId, etc.)
   * Used for idempotency and audit trail.
   */
  sourceId: string

  /**
   * Idempotency key — prevents duplicate processing.
   * Format: `{type}:{sourceId}:{uid}`
   * Stored as a field so we can query/check.
   */
  idempotencyKey: string

  /** Human-readable description */
  description: string
  descriptionEn?: string

  /** Arbitrary metadata for context */
  metadata?: Record<string, unknown>

  /** If this transaction was reversed, link to the reversal tx */
  reversedByTxId?: string

  /** If this is a reversal, link to the original tx */
  reversesOriginalTxId?: string

  /** Who initiated this (uid for admin, "system" for automated) */
  actorId: string

  /** ISO timestamp */
  createdAt: string

  /** ISO timestamp when status changed to completed */
  processedAt?: string
}

// ═══════════════════════════════════════════════════════════════
// REDEMPTION (ENHANCED)
// ═══════════════════════════════════════════════════════════════

export type RedemptionStatus = "pending" | "used" | "expired" | "cancelled" | "reversed"

export interface EnhancedRedemption {
  id?: string
  orgId: string
  uid: string
  rewardId: string
  rewardName: string
  rewardNameEn?: string
  pointsSpent: number
  /** 6-char alphanumeric code */
  code: string
  status: RedemptionStatus
  /** Link to the loyalty_transaction that debited points */
  loyaltyTxId: string
  /** If reversed, link to the reversal tx */
  reversalTxId?: string
  createdAt: string
  usedAt?: string
  expiresAt: string
  usedByStaffId?: string
}

// ═══════════════════════════════════════════════════════════════
// QUIZ ATTEMPT (SERVER-SIDE VALIDATION)
// ═══════════════════════════════════════════════════════════════

export interface QuizAttempt {
  id?: string
  orgId: string
  uid: string
  quizId: string
  /** Answers given (index per question) */
  answers: number[]
  /** Correct count */
  correctCount: number
  /** Total questions */
  totalQuestions: number
  /** Points awarded (0 if already completed or retake not allowed) */
  pointsAwarded: number
  /** Whether this is a first attempt or a retake */
  isFirstAttempt: boolean
  /** Link to loyalty_transaction if points were awarded */
  loyaltyTxId?: string
  createdAt: string
}

// ═══════════════════════════════════════════════════════════════
// MISSION COMPLETION (SERVER-SIDE VALIDATION)
// ═══════════════════════════════════════════════════════════════

export interface MissionCompletion {
  id?: string
  orgId: string
  uid: string
  missionId: string
  /** Snapshot of criteria at time of completion */
  criteriaSnapshot: Array<{ type: string; target: number; actual: number }>
  /** Points awarded */
  pointsAwarded: number
  /** Badge unlocked (if any) */
  badgeUnlocked?: string
  /** Link to loyalty_transaction */
  loyaltyTxId?: string
  completedAt: string
}

// ═══════════════════════════════════════════════════════════════
// BALANCE CACHE (what lives on customer_profiles for fast reads)
// ═══════════════════════════════════════════════════════════════

/**
 * These fields on customer_profiles are CACHES of the ledger.
 * The server updates them atomically with each transaction.
 * If they ever drift, a reconciliation job can recalculate from ledger.
 */
export interface LoyaltyBalanceCache {
  /** Current spendable balance */
  loyaltyPoints: number
  /** Total ever earned (for level calculation) */
  totalPointsEarned: number
  /** Total ever redeemed */
  totalPointsRedeemed: number
  /** ID of last processed transaction (for ordering) */
  lastTxId?: string
  /** ISO timestamp of last transaction */
  lastTxAt?: string
}
