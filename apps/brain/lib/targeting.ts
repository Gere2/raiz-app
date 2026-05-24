/**
 * lib/targeting.ts — Publication states, targeting rules, eligibility
 *
 * Inlined in Brain (Vercel deploys standalone, @raiz/shared not available).
 * Pure functions — no Firebase dependency.
 */

// ═══════════════════════════════════════════════════════════════
// PUBLICATION STATE
// ═══════════════════════════════════════════════════════════════

export type PublicationStatus = "draft" | "published" | "archived"

export interface PublicationState {
  status: PublicationStatus
  activeFrom?: string | null
  activeUntil?: string | null
  targeting?: TargetingRule[]
  createdBy?: string
  updatedBy?: string
  publishedAt?: string | null
  archivedAt?: string | null
}

// ═══════════════════════════════════════════════════════════════
// TARGETING RULES
// ═══════════════════════════════════════════════════════════════

export type TargetingRuleType =
  | "segment" | "level" | "trait"
  | "new_user" | "min_purchases" | "max_purchases"
  | "date_range" | "day_of_week" | "time_range"
  | "campaign" | "academic_period"
  | "has_badge" | "completed_quiz" | "completed_mission"

export interface TargetingRule {
  type: TargetingRuleType
  value: unknown
  negate?: boolean
}

export type CustomerSegment = "new" | "occasional" | "regular" | "loyal" | "churning"
export type LevelId = "semilla" | "brote" | "raiz" | "cosecha" | "barista"
export type CoffeeProfileTrait =
  | "intenso" | "suave" | "explorador" | "clasico"
  | "rapido" | "curioso" | "sostenible" | "social"

export interface CustomerContext {
  uid: string
  segment: CustomerSegment
  levelId: LevelId
  traits: CoffeeProfileTrait[]
  totalPurchases: number
  completedQuizzes: string[]
  completedMissions: string[]
  unlockedBadges: string[]
  registeredAt?: string
  now: string
  currentDayOfWeek: number
  currentTime: string
  activeCampaigns?: string[]
}

export interface EligibilityResult {
  eligible: boolean
  failedRules?: Array<{ type: TargetingRuleType; reason: string }>
}

// ═══════════════════════════════════════════════════════════════
// EVALUATOR
// ═══════════════════════════════════════════════════════════════

export function isEligible(
  entity: PublicationState,
  ctx: CustomerContext,
): EligibilityResult {
  const failedRules: Array<{ type: TargetingRuleType; reason: string }> = []

  if (entity.status !== "published") {
    return { eligible: false, failedRules: [{ type: "campaign", reason: `status is ${entity.status}` }] }
  }

  if (entity.activeFrom && ctx.now < entity.activeFrom) {
    failedRules.push({ type: "date_range", reason: `not yet active (from ${entity.activeFrom})` })
  }
  if (entity.activeUntil && ctx.now > entity.activeUntil) {
    failedRules.push({ type: "date_range", reason: `expired (until ${entity.activeUntil})` })
  }

  if (failedRules.length > 0) return { eligible: false, failedRules }

  if (!entity.targeting || entity.targeting.length === 0) {
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

export function filterEligible<T extends PublicationState>(
  entities: T[],
  ctx: CustomerContext,
): T[] {
  return entities.filter(e => isEligible(e, ctx).eligible)
}

export function buildCustomerContext(
  profile: Record<string, unknown>,
  overrides?: Partial<CustomerContext>,
): CustomerContext {
  const now = new Date()
  return {
    uid: (profile.uid as string) || "",
    segment: (profile.segment as CustomerSegment) || "new",
    levelId: (profile.levelId as LevelId) || "semilla",
    traits: (profile.coffeeProfileTraits as CoffeeProfileTrait[]) || [],
    totalPurchases: (profile.totalVisits as number) || 0,
    completedQuizzes: (profile.completedQuizzes as string[]) || [],
    completedMissions: (profile.completedMissions as string[]) || [],
    unlockedBadges: (profile.unlockedBadges as string[]) || [],
    registeredAt: profile.createdAt as string | undefined,
    now: now.toISOString(),
    currentDayOfWeek: now.getDay(),
    currentTime: now.toTimeString().slice(0, 5),
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Rule evaluators
// ═══════════════════════════════════════════════════════════════

function evaluateRule(rule: TargetingRule, ctx: CustomerContext): boolean {
  switch (rule.type) {
    case "segment": return ctx.segment === rule.value
    case "level": return ctx.levelId === rule.value
    case "trait": return ctx.traits.includes(rule.value as CoffeeProfileTrait)
    case "new_user": {
      if (!ctx.registeredAt) return false
      return daysBetween(ctx.registeredAt, ctx.now) <= (rule.value as number)
    }
    case "min_purchases": return ctx.totalPurchases >= (rule.value as number)
    case "max_purchases": return ctx.totalPurchases <= (rule.value as number)
    case "date_range": {
      const range = rule.value as { from: string; to: string }
      return ctx.now >= range.from && ctx.now <= range.to
    }
    case "day_of_week": {
      return (rule.value as number[]).includes(ctx.currentDayOfWeek)
    }
    case "time_range": {
      const tr = rule.value as { from: string; to: string }
      return ctx.currentTime >= tr.from && ctx.currentTime <= tr.to
    }
    case "campaign": return ctx.activeCampaigns?.includes(rule.value as string) ?? false
    case "academic_period": return ctx.activeCampaigns?.includes(rule.value as string) ?? false
    case "has_badge": return ctx.unlockedBadges.includes(rule.value as string)
    case "completed_quiz": return ctx.completedQuizzes.includes(rule.value as string)
    case "completed_mission": return ctx.completedMissions.includes(rule.value as string)
    default: return true // unknown rules fail open
  }
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24))
}
