/**
 * lib/event-types.ts — Standardized event model for gamification + loyalty
 *
 * Three tiers:
 * 1. DOMAIN events — authoritative, idempotent, written in Firestore transactions
 * 2. ANALYTICS events — best-effort, async, feed dashboards
 * 3. RAW events — low-level UI tracking, best-effort
 *
 * All events stored in: orgs/{orgId}/events
 */

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES (string constants)
// ═══════════════════════════════════════════════════════════════

/**
 * DOMAIN events: written atomically with business operations.
 * These MUST be idempotent and part of server-side transactions.
 */
export const DOMAIN_EVENTS = {
  // Loyalty
  "loyalty.points_earned": true,
  "loyalty.points_redeemed": true,
  "loyalty.points_reversed": true,
  "loyalty.balance_corrected": true,

  // Gamification completions
  "gamification.quiz_completed": true,
  "gamification.mission_completed": true,
  "gamification.badge_unlocked": true,

  // Rewards
  "rewards.redeemed": true,
  "rewards.redemption_used": true,
  "rewards.redemption_expired": true,
  "rewards.redemption_reversed": true,
} as const

/**
 * ANALYTICS events: best-effort, async logging.
 * Feed dashboard metrics but NOT business-critical.
 */
export const ANALYTICS_EVENTS = {
  // Quiz funnel
  "quiz.viewed": true,
  "quiz.started": true,
  "quiz.completed": true,  // analytics duplicate of domain event
  "quiz.abandoned": true,

  // Mission funnel
  "mission.viewed": true,
  "mission.progress_updated": true,
  "mission.completed": true,

  // Reward funnel
  "reward.viewed": true,
  "reward.redeem_requested": true,
  "reward.redeemed": true,
  "reward.code_shown": true,
  "reward.expired": true,

  // Engagement
  "user.session_start": true,
  "user.level_up": true,
  "user.streak_updated": true,
  "user.profile_viewed": true,
} as const

/**
 * ACTIVATION events: best-effort UI tracking for the Enverde /org hub
 * (demo cafetería, onboarding guiado, resumen de rentabilidad).
 * Privacy: never carry amounts, products, extracts or customer names —
 * the POST /api/org/[orgId]/events handler enforces an allowlist of types
 * and sanitizes metadata down to { surface, step, state }.
 */
export const ACTIVATION_EVENTS = {
  demo_opened: true,
  demo_closed: true,
  cta_upload_statement_clicked: true,
  cta_products_clicked: true,
  cta_recipes_clicked: true,
  cta_manual_sales_clicked: true,
  cta_pos_clicked: true,
  profitability_summary_seen: true,
  onboarding_step_clicked: true,
} as const

export type DomainEventType = keyof typeof DOMAIN_EVENTS
export type AnalyticsEventType = keyof typeof ANALYTICS_EVENTS
export type ActivationEventType = keyof typeof ACTIVATION_EVENTS
export type EventType = DomainEventType | AnalyticsEventType | ActivationEventType

// ═══════════════════════════════════════════════════════════════
// EVENT SHAPE
// ═══════════════════════════════════════════════════════════════

export interface LoyaltyEvent {
  /** Event type identifier */
  type: EventType
  /** Origin: SYSTEM (server), APP (client), POS (barista) */
  source: "SYSTEM" | "APP" | "POS"
  /** Organization ID */
  orgId: string
  /** User who triggered / is affected by the event */
  uid?: string
  /** Structured event data */
  data: Record<string, unknown>
  /** ISO timestamp */
  timestamp: string
  /** Idempotency key for domain events (prevents double-write) */
  idempotencyKey?: string
  /** Which tier: domain events require idempotency, analytics are best-effort */
  tier: "domain" | "analytics"
}

// ═══════════════════════════════════════════════════════════════
// EVENT DATA SHAPES (per event type)
// ═══════════════════════════════════════════════════════════════

export interface PointsEarnedData {
  uid: string
  amount: number
  balanceAfter: number
  sourceType: string
  sourceId: string
  txId: string
}

export interface PointsRedeemedData {
  uid: string
  amount: number
  rewardId: string
  rewardName: string
  code: string
  txId: string
}

export interface PointsReversedData {
  uid: string
  amount: number
  originalTxId: string
  reason: string
  txId: string
}

export interface QuizCompletedData {
  uid: string
  quizId: string
  correctCount: number
  totalQuestions: number
  pointsAwarded: number
}

export interface MissionCompletedData {
  uid: string
  missionId: string
  reward: number
}

export interface BadgeUnlockedData {
  uid: string
  badgeId: string
  bonusPoints: number
}

export interface RewardRedeemedData {
  uid: string
  rewardId: string
  pointsCost: number
  code: string
  redemptionId: string
}

export interface RedemptionUsedData {
  uid: string
  redemptionId: string
  code: string
  validatedBy: string // staff uid
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Check if an event type is a domain event (requires idempotency) */
export function isDomainEvent(type: string): boolean {
  return type in DOMAIN_EVENTS
}

/** Check if an event type is an analytics event (best-effort) */
export function isAnalyticsEvent(type: string): boolean {
  return type in ANALYTICS_EVENTS
}

/** Check if an event type is an activation event (best-effort UI tracking) */
export function isActivationEvent(type: string): boolean {
  return type in ACTIVATION_EVENTS
}
