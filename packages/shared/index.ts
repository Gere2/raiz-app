// ── Legacy exports (backwards compatible) ──
export * from "./firebase"
export * from "./types"
export * from "./weather-enrichment"
export { createCategoryResolver } from "./category-resolver"

// ── New shared types ──
export * from "./types/product"
export * from "./types/order"
export * from "./types/customer"
export * from "./types/reward"
export * from "./types/gamification"
export * from "./types/recipe"
export * from "./types/inventory"
export * from "./types/events"
export * from "./types/staff"
export * from "./types/loyalty"
export * from "./types/editorial"

// ── Shared services ──
export { logEvent, logEventAdmin } from "./services/event-logger"
export { getActiveRewards, getAllRewards, invalidateRewardsCache, FALLBACK_REWARDS } from "./services/rewards-catalog"
export { getActiveQuizzes, getAllQuizzes as getAllQuizzesAdmin, groupIntoModules, invalidateQuizCache } from "./services/quiz-catalog"
export { getActiveMissions as getActiveMissionsDynamic, getAllMissions as getAllMissionsAdmin, invalidateMissionCache } from "./services/mission-catalog"
export { isEligible, filterEligible } from "./services/targeting-evaluator"
export * from "./services/rate-limiter"
