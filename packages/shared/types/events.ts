/**
 * types/events.ts — Sistema de eventos del ecosistema
 * Log append-only en orgs/{orgId}/events
 *
 * Event categories:
 * - order.*           — Order lifecycle
 * - loyalty.*         — Ledger-backed point movements
 * - gamification.*    — Quiz/mission/badge/streak events
 * - rewards.*         — Reward redemption lifecycle
 * - catalog.*         — Product catalog changes
 * - pricing.*         — Price changes
 * - inventory.*       — Stock events
 * - recipe.*          — Recipe/ingredient cost changes
 * - customer.*        — Customer lifecycle
 * - editorial.*       — Content publication events
 * - operational.*     — Shift/waste events
 */

export type EventType =
  // Pedidos
  | "order.created"
  | "order.paid"
  | "order.status_changed"
  | "order.ready"
  | "order.picked_up"
  | "order.canceled"
  // Loyalty (ledger-backed — every one of these has a loyalty_transaction)
  | "loyalty.points_earned"
  | "loyalty.points_redeemed"
  | "loyalty.points_reversed"
  | "loyalty.balance_corrected"
  | "loyalty.level_up"
  // Gamificación — Quizzes
  | "gamification.quiz_viewed"
  | "gamification.quiz_started"
  | "gamification.quiz_completed"
  // Gamificación — Missions
  | "gamification.mission_viewed"
  | "gamification.mission_completed"
  // Gamificación — Badges
  | "gamification.badge_unlocked"
  // Gamificación — Streaks
  | "gamification.streak_milestone"
  // Rewards lifecycle
  | "rewards.catalog_updated"
  | "rewards.viewed"
  | "rewards.redeem_requested"
  | "rewards.redeemed"
  | "rewards.used"
  | "rewards.expired"
  | "rewards.reversed"
  // Catálogo
  | "catalog.product_created"
  | "catalog.product_updated"
  | "catalog.availability_changed"
  // Pricing
  | "pricing.price_changed"
  // Inventario
  | "inventory.stock_low"
  | "inventory.stock_depleted"
  | "inventory.movement_logged"
  // Recetas y costes
  | "recipe.cost_changed"
  | "ingredient.cost_updated"
  // Clientes
  | "customer.created"
  | "customer.segment_changed"
  | "customer.churning_detected"
  | "customer.feedback_submitted"
  // Operativos
  | "shift.closed"
  | "waste.logged"
  // Editorial (content governance)
  | "editorial.published"
  | "editorial.archived"
  | "editorial.scheduled"

export type EventSource = "APP" | "POS" | "BRAIN" | "SYSTEM"

/**
 * Idempotency classification:
 * - REQUIRED: loyalty.*, rewards.redeemed, rewards.reversed (prevent double processing)
 * - BEST_EFFORT: gamification.*, editorial.* (duplicates harmless for analytics)
 *
 * Side-effect events (trigger downstream processing):
 * - loyalty.points_earned → check level_up, check mission completion
 * - gamification.quiz_completed → check badge unlock, check mission completion
 * - gamification.mission_completed → check badge unlock
 * - rewards.redeemed → update redemption status
 * - order.canceled → trigger loyalty.points_reversed
 */
export interface SystemEvent {
  id?: string
  type: EventType
  source: EventSource
  orgId: string
  timestamp: unknown
  data: Record<string, unknown>
  actorId?: string
  actorName?: string
  /** For idempotent events: prevents duplicate processing */
  idempotencyKey?: string
}
