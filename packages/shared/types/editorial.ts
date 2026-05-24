/**
 * types/editorial.ts — Publication states, targeting, and analytics
 *
 * Applies to: quizzes, missions, rewards
 * Brain creates content in draft → publishes → App only sees published+active
 */

import type { CustomerSegment, CoffeeProfileTrait } from "./customer"
import type { LevelId } from "./gamification"

// ═══════════════════════════════════════════════════════════════
// PUBLICATION STATE
// ═══════════════════════════════════════════════════════════════

export type PublicationStatus = "draft" | "published" | "archived"

/**
 * Mixin interface — add to Quiz, Mission, Reward types.
 * Every governable entity gets these fields.
 */
export interface PublicationState {
  /** Editorial status */
  status: PublicationStatus

  /** ISO timestamp — content visible FROM this date (null = immediately when published) */
  activeFrom?: string | null

  /** ISO timestamp — content visible UNTIL this date (null = no expiry) */
  activeUntil?: string | null

  /** Targeting rules (empty = available to everyone) */
  targeting?: TargetingRule[]

  /** Who created this content */
  createdBy?: string

  /** Who last updated this content */
  updatedBy?: string

  /** ISO timestamp of when status was set to 'published' */
  publishedAt?: string | null

  /** ISO timestamp of when status was set to 'archived' */
  archivedAt?: string | null
}

// ═══════════════════════════════════════════════════════════════
// TARGETING
// ═══════════════════════════════════════════════════════════════

/**
 * A targeting rule is a single condition.
 * Multiple rules = AND logic (all must match).
 * Use separate "targeting groups" if OR logic is needed in the future.
 *
 * Design principle: simple, evaluable both client and server side.
 */
export type TargetingRuleType =
  | "segment"               // Customer segment
  | "level"                 // Loyalty level
  | "trait"                 // Coffee profile trait
  | "new_user"              // First N days since registration
  | "min_purchases"         // Minimum purchase count
  | "max_purchases"         // Maximum purchase count
  | "date_range"            // Active within date range
  | "day_of_week"           // Active on specific days (0=Sun..6=Sat)
  | "time_range"            // Active during time window (HH:mm)
  | "campaign"              // Linked to a campaign tag
  | "academic_period"       // Linked to academic period
  | "has_badge"             // User has specific badge
  | "completed_quiz"        // User has completed specific quiz
  | "completed_mission"     // User has completed specific mission

export interface TargetingRule {
  type: TargetingRuleType

  /**
   * The value to match. Shape depends on type:
   * - segment: CustomerSegment (e.g., "loyal")
   * - level: LevelId (e.g., "raiz")
   * - trait: CoffeeProfileTrait (e.g., "explorador")
   * - new_user: number (days since registration, e.g., 30)
   * - min_purchases: number
   * - max_purchases: number
   * - date_range: { from: string, to: string } (ISO dates)
   * - day_of_week: number[] (e.g., [1,2,3,4,5] for weekdays)
   * - time_range: { from: string, to: string } (e.g., "08:00", "12:00")
   * - campaign: string (campaign tag)
   * - academic_period: string (e.g., "exam-week-spring-2026")
   * - has_badge: string (badge ID)
   * - completed_quiz: string (quiz ID)
   * - completed_mission: string (mission ID)
   */
  value: unknown

  /** If true, INVERT the condition (NOT matching) */
  negate?: boolean
}

// ═══════════════════════════════════════════════════════════════
// ELIGIBILITY CHECK RESULT
// ═══════════════════════════════════════════════════════════════

export interface EligibilityResult {
  eligible: boolean
  /** Which rules failed, if any */
  failedRules?: Array<{
    type: TargetingRuleType
    reason: string
  }>
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER CONTEXT (for evaluating targeting)
// ═══════════════════════════════════════════════════════════════

/**
 * All the context needed to evaluate targeting rules.
 * Built from customer_profiles + current timestamp.
 */
export interface CustomerContext {
  uid: string
  segment: CustomerSegment
  levelId: LevelId
  traits: CoffeeProfileTrait[]
  totalPurchases: number
  completedQuizzes: string[]
  completedMissions: string[]
  unlockedBadges: string[]
  registeredAt?: string      // ISO date
  now: string                // ISO date for evaluation
  currentDayOfWeek: number   // 0=Sun..6=Sat
  currentTime: string        // HH:mm
  activeCampaigns?: string[] // Active campaign tags
}

// ═══════════════════════════════════════════════════════════════
// GAMIFICATION ANALYTICS
// ═══════════════════════════════════════════════════════════════

/** Snapshot of gamification metrics — stored daily or on-demand */
export interface GamificationAnalyticsSnapshot {
  orgId: string
  /** ISO date string (YYYY-MM-DD) */
  date: string

  // Quizzes
  quizImpressions: number
  quizStarts: number
  quizCompletions: number
  quizPointsGranted: number

  // Missions
  missionViews: number
  missionCompletions: number
  missionPointsGranted: number

  // Rewards
  rewardViews: number
  redemptionRequests: number
  successfulRedemptions: number
  expiredRedemptions: number

  // Loyalty economy
  totalPointsEarned: number
  totalPointsRedeemed: number
  totalPointsReversed: number
  pointsInCirculation: number
  /** Estimated euro liability of outstanding points */
  estimatedLiability: number

  // Engagement
  activeUsers: number
  newUsers: number

  createdAt: string
}

/** Per-entity metric counters (stored on the entity itself or in a subcollection) */
export interface ContentMetrics {
  impressions: number
  starts: number
  completions: number
  completionRate: number
  totalPointsGranted: number
  lastUpdated: string
}
