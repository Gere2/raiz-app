/**
 * services/targeting-evaluator.ts
 *
 * Pure function — no side effects, no Firebase dependency.
 * Evaluates targeting rules against a customer context.
 * Usable both client-side (App) and server-side (Brain API routes).
 */

import type {
  TargetingRule,
  CustomerContext,
  EligibilityResult,
  PublicationState,
} from "../types/editorial"

/**
 * Check if an entity (quiz, mission, reward) with publication state
 * is currently visible and eligible for a given customer.
 *
 * This combines:
 * 1. Publication status check (must be "published")
 * 2. Time window check (activeFrom / activeUntil)
 * 3. Targeting rules check (all must pass — AND logic)
 */
export function isEligible(
  entity: PublicationState,
  ctx: CustomerContext,
): EligibilityResult {
  const failedRules: EligibilityResult["failedRules"] = []

  // 1. Status check
  if (entity.status !== "published") {
    return { eligible: false, failedRules: [{ type: "campaign", reason: `status is ${entity.status}` }] }
  }

  // 2. Time window
  if (entity.activeFrom && ctx.now < entity.activeFrom) {
    failedRules.push({ type: "date_range", reason: `not yet active (from ${entity.activeFrom})` })
  }
  if (entity.activeUntil && ctx.now > entity.activeUntil) {
    failedRules.push({ type: "date_range", reason: `expired (until ${entity.activeUntil})` })
  }

  if (failedRules.length > 0) return { eligible: false, failedRules }

  // 3. Targeting rules (empty = everyone)
  if (!entity.targeting || !Array.isArray(entity.targeting)) {
    return { eligible: true }
  }
  if (entity.targeting.length === 0) {
    return { eligible: true }
  }

  for (const rule of entity.targeting) {
    const pass = evaluateRule(rule, ctx)
    const effective = rule.negate ? !pass : pass
    if (!effective) {
      failedRules.push({ type: rule.type, reason: `rule ${rule.type} ${rule.negate ? "(negated) " : ""}did not match` })
    }
  }

  return {
    eligible: failedRules.length === 0,
    failedRules: failedRules.length > 0 ? failedRules : undefined,
  }
}

/**
 * Filter a list of entities to only those eligible for the customer.
 * Generic — works with any entity that has PublicationState fields.
 */
export function filterEligible<T extends PublicationState>(
  entities: T[],
  ctx: CustomerContext,
): T[] {
  return entities.filter(e => isEligible(e, ctx).eligible)
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Rule evaluators
// ═══════════════════════════════════════════════════════════════

function evaluateRule(rule: TargetingRule, ctx: CustomerContext): boolean {
  switch (rule.type) {
    case "segment":
      return ctx.segment === rule.value

    case "level":
      return ctx.levelId === rule.value

    case "trait":
      return ctx.traits.includes(rule.value as any)

    case "new_user": {
      if (!ctx.registeredAt) return false
      const daysSince = daysBetween(ctx.registeredAt, ctx.now)
      return daysSince <= (rule.value as number)
    }

    case "min_purchases":
      return ctx.totalPurchases >= (rule.value as number)

    case "max_purchases":
      return ctx.totalPurchases <= (rule.value as number)

    case "date_range": {
      const range = rule.value as { from: string; to: string }
      return ctx.now >= range.from && ctx.now <= range.to
    }

    case "day_of_week": {
      const days = rule.value as number[]
      return days.includes(ctx.currentDayOfWeek)
    }

    case "time_range": {
      const tr = rule.value as { from: string; to: string }
      return ctx.currentTime >= tr.from && ctx.currentTime <= tr.to
    }

    case "campaign": {
      const tag = rule.value as string
      return ctx.activeCampaigns?.includes(tag) ?? false
    }

    case "academic_period": {
      // academic_period is matched via activeCampaigns or a simple string match
      const period = rule.value as string
      return ctx.activeCampaigns?.includes(period) ?? false
    }

    case "has_badge":
      return ctx.unlockedBadges.includes(rule.value as string)

    case "completed_quiz":
      return ctx.completedQuizzes.includes(rule.value as string)

    case "completed_mission":
      return ctx.completedMissions.includes(rule.value as string)

    default: {
      const _exhaustive: never = rule.type
      console.warn(`[TargetingEvaluator] Unknown rule type: ${(rule as any).type}`)
      return false
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24))
}
