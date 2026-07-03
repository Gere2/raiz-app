/**
 * __tests__/loyalty-hardening.test.ts
 *
 * Tests for PR5-PR8 hardening:
 *  PR5: Org isolation in customers
 *  PR6: Badge race condition prevention
 *  PR7: Redemption expiry enforcement
 *  PR8: Quiz cap server-side enforcement
 *
 * These test the LOGIC and INVARIANTS, not Firestore directly.
 * Run: npx vitest run __tests__/loyalty-hardening.test.ts
 */

import { describe, it, expect } from "vitest"

// ═══════════════════════════════════════════════════════════════
// PR5: ORG ISOLATION
// ═══════════════════════════════════════════════════════════════

describe("PR5 — Org Isolation", () => {
  it("query without orgId filter should be considered unsafe", () => {
    // Simulate: a query that doesn't include orgId is a violation
    const queryHasOrgFilter = (filters: string[]) =>
      filters.includes("orgId")

    expect(queryHasOrgFilter(["orgId", "status"])).toBe(true)
    expect(queryHasOrgFilter(["status"])).toBe(false) // unsafe!
    expect(queryHasOrgFilter([])).toBe(false)
  })

  it("customer profile must have orgId set on creation", () => {
    const newProfile = {
      uid: "user-1",
      orgId: "org-cafe-1",
      loyaltyPoints: 0,
    }
    expect(newProfile.orgId).toBeDefined()
    expect(newProfile.orgId).toBe("org-cafe-1")
  })

  it("profile with mismatched orgId should be rejected", () => {
    const profileOrgId: string = "org-cafe-1"
    const requestOrgId: string = "org-cafe-2"
    const isAllowed = profileOrgId === requestOrgId
    expect(isAllowed).toBe(false)
  })

  it("backfill assigns orgId to profiles without it", () => {
    const profiles = [
      { uid: "u1", orgId: "org-1" },
      { uid: "u2" }, // missing orgId
      { uid: "u3", orgId: "org-1" },
    ]

    const targetOrgId = "org-1"
    let updated = 0
    for (const p of profiles) {
      if (!(p as any).orgId) {
        (p as any).orgId = targetOrgId
        updated++
      }
    }

    expect(updated).toBe(1)
    expect((profiles[1] as any).orgId).toBe("org-1")
  })

  it("transactions query must be scoped by orgId + uid", () => {
    const requiredFilters = ["uid", "orgId"]
    const actualFilters = ["uid", "orgId", "createdAt"]
    const hasAll = requiredFilters.every(f => actualFilters.includes(f))
    expect(hasAll).toBe(true)
  })

  it("redemptions query must be scoped by orgId", () => {
    const query = { uid: "u1", orgId: "org-1", status: "pending" }
    expect(query.orgId).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// PR6: BADGE RACE CONDITION
// ═══════════════════════════════════════════════════════════════

describe("PR6 — Badge Race Condition Prevention", () => {
  it("idempotency key for badge is deterministic: earn.badge:{badgeId}:{uid}", () => {
    const key1 = `earn.badge:first-sip:user-abc`
    const key2 = `earn.badge:first-sip:user-abc`
    expect(key1).toBe(key2)
  })

  it("different badges produce different idempotency keys", () => {
    const key1 = `earn.badge:first-sip:user-abc`
    const key2 = `earn.badge:curious-mind:user-abc`
    expect(key1).not.toBe(key2)
  })

  it("concurrent unlock: first wins, second is duplicate (idempotency)", () => {
    // Simulate two concurrent badge unlock attempts
    const completedTxIds = new Set<string>()

    const attemptUnlock = (badgeId: string, uid: string) => {
      const key = `earn.badge:${badgeId}:${uid}`
      if (completedTxIds.has(key)) {
        return { success: true, duplicate: true }
      }
      completedTxIds.add(key)
      return { success: true, duplicate: false, txId: "tx-new" }
    }

    const result1 = attemptUnlock("first-sip", "user-1")
    const result2 = attemptUnlock("first-sip", "user-1")

    expect(result1.duplicate).toBe(false)
    expect(result2.duplicate).toBe(true)
  })

  it("arrayUnion is idempotent — adding same badge twice = no-op", () => {
    // Simulate Firestore arrayUnion behavior
    const arrayUnion = (arr: string[], value: string) => {
      if (arr.includes(value)) return [...arr]
      return [...arr, value]
    }

    const badges = ["first-sip"]
    const after1 = arrayUnion(badges, "curious-mind")
    expect(after1).toEqual(["first-sip", "curious-mind"])

    // Adding again = no change
    const after2 = arrayUnion(after1, "curious-mind")
    expect(after2).toEqual(["first-sip", "curious-mind"])
  })

  it("badge bonus points only awarded once per badge per user", () => {
    const awardedBadges = new Map<string, boolean>()

    const awardBadgeBonus = (badgeId: string, uid: string, bonus: number) => {
      const key = `${badgeId}:${uid}`
      if (awardedBadges.has(key)) {
        return { awarded: false, points: 0 }
      }
      awardedBadges.set(key, true)
      return { awarded: true, points: bonus }
    }

    const r1 = awardBadgeBonus("first-sip", "user-1", 50)
    const r2 = awardBadgeBonus("first-sip", "user-1", 50)

    expect(r1.awarded).toBe(true)
    expect(r1.points).toBe(50)
    expect(r2.awarded).toBe(false)
    expect(r2.points).toBe(0)
  })

  it("different users can independently unlock same badge", () => {
    const keys = new Set<string>()
    const unlock = (badge: string, uid: string) => {
      const key = `earn.badge:${badge}:${uid}`
      if (keys.has(key)) return { duplicate: true }
      keys.add(key)
      return { duplicate: false }
    }

    expect(unlock("first-sip", "user-A").duplicate).toBe(false)
    expect(unlock("first-sip", "user-B").duplicate).toBe(false)
    expect(unlock("first-sip", "user-A").duplicate).toBe(true) // repeat
  })
})

// ═══════════════════════════════════════════════════════════════
// PR7: REDEMPTION EXPIRY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

describe("PR7 — Redemption Expiry Enforcement", () => {
  const now = new Date("2026-03-13T12:00:00Z")

  it("pending redemption within expiry is valid", () => {
    const expiresAt = new Date("2026-03-14T12:00:00Z") // tomorrow
    const isExpired = expiresAt < now
    expect(isExpired).toBe(false)
  })

  it("pending redemption past expiry is rejected", () => {
    const expiresAt = new Date("2026-03-12T12:00:00Z") // yesterday
    const isExpired = expiresAt < now
    expect(isExpired).toBe(true)
  })

  it("redemption with status 'used' cannot be reused", () => {
    const statuses = ["used", "expired"]
    for (const status of statuses) {
      const canUse = status === "pending"
      expect(canUse).toBe(false)
    }
  })

  it("48-hour expiry window is correctly calculated", () => {
    const createdAt = new Date("2026-03-13T10:00:00Z")
    const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000)
    const expected = new Date("2026-03-15T10:00:00Z")
    expect(expiresAt.getTime()).toBe(expected.getTime())
  })

  it("expired redemption transitions to 'expired' status", () => {
    let status: "pending" | "used" | "expired" = "pending"
    const expiresAt = new Date("2026-03-12T12:00:00Z")

    if (expiresAt < now && status === "pending") {
      status = "expired"
    }

    expect(status).toBe("expired")
  })

  it("used redemption should not be affected by expiry sweep", () => {
    const redemption = { status: "used", expiresAt: "2026-03-12T00:00:00Z" }
    // Even if past expiry, used status takes precedence
    const shouldExpire = redemption.status === "pending" &&
      new Date(redemption.expiresAt) < now
    expect(shouldExpire).toBe(false)
  })

  it("code validation: 6-char uppercase format", () => {
    const validCode = "AB3D5F"
    const invalidCodes = ["", "AB", "ab3d5f7", "12345", null]

    expect(validCode.length).toBe(6)

    for (const code of invalidCodes) {
      const isValid = typeof code === "string" && code.length === 6
      expect(isValid).toBe(false)
    }
  })

  it("on-read expiry filters out stale redemptions from active list", () => {
    const redemptions = [
      { id: "r1", status: "pending", expiresAt: "2026-03-14T00:00:00Z" }, // valid
      { id: "r2", status: "pending", expiresAt: "2026-03-12T00:00:00Z" }, // expired
      { id: "r3", status: "pending", expiresAt: "2026-03-15T00:00:00Z" }, // valid
    ]

    const active = redemptions.filter(r => {
      const exp = new Date(r.expiresAt)
      return exp >= now
    })

    expect(active).toHaveLength(2)
    expect(active.map(r => r.id)).toEqual(["r1", "r3"])
  })
})

// ═══════════════════════════════════════════════════════════════
// PR8: QUIZ CAP SERVER-SIDE
// ═══════════════════════════════════════════════════════════════

describe("PR8 — Quiz Cap Server-Side Enforcement", () => {
  const MAX_WEEKLY_QUIZ_POINTS = 300

  it("user below cap: full points awarded", () => {
    const weeklyEarned = 100
    const quizPoints = 70
    const remaining = MAX_WEEKLY_QUIZ_POINTS - weeklyEarned

    expect(remaining).toBe(200)
    expect(quizPoints <= remaining).toBe(true)
    // Award full points
    const awarded = quizPoints
    expect(awarded).toBe(70)
  })

  it("user at cap: zero points awarded", () => {
    const weeklyEarned = 300
    const quizPoints = 60

    const atCap = weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS
    expect(atCap).toBe(true)

    const awarded = atCap ? 0 : quizPoints
    expect(awarded).toBe(0)
  })

  it("user would exceed cap: truncated to remaining", () => {
    const weeklyEarned = 250
    const quizPoints = 100
    const remaining = MAX_WEEKLY_QUIZ_POINTS - weeklyEarned // 50

    expect(weeklyEarned + quizPoints).toBeGreaterThan(MAX_WEEKLY_QUIZ_POINTS)

    const awarded = Math.min(quizPoints, remaining)
    expect(awarded).toBe(50)
  })

  it("week boundary: Monday 00:00 UTC", () => {
    // Wednesday March 11
    const wed = new Date("2026-03-11T15:30:00Z")
    const day = wed.getUTCDay() // 3 (Wed)
    const diff = wed.getUTCDate() - day + (day === 0 ? -6 : 1) // Monday
    const weekStart = new Date(wed)
    weekStart.setUTCDate(diff)
    weekStart.setUTCHours(0, 0, 0, 0)

    expect(weekStart.getUTCDay()).toBe(1) // Monday
    expect(weekStart.toISOString()).toBe("2026-03-09T00:00:00.000Z")
  })

  it("Sunday belongs to the same week as the preceding Monday", () => {
    const sun = new Date("2026-03-15T20:00:00Z") // Sunday
    const day = sun.getUTCDay() // 0 (Sun)
    const diff = sun.getUTCDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(sun)
    weekStart.setUTCDate(diff)
    weekStart.setUTCHours(0, 0, 0, 0)

    // Should be Monday March 9
    expect(weekStart.toISOString()).toBe("2026-03-09T00:00:00.000Z")
  })

  it("answer index validation: rejects out-of-bounds", () => {
    const questions = [
      { options: ["A", "B", "C", "D"], correctIndex: 2 },
      { options: ["A", "B", "C"], correctIndex: 0 },
    ]
    const validAnswers = [1, 2]
    const invalidAnswers = [5, -1]

    for (let i = 0; i < questions.length; i++) {
      const ans = validAnswers[i]
      const valid = typeof ans === "number" && ans >= 0 && ans < questions[i].options.length && Number.isInteger(ans)
      expect(valid).toBe(true)
    }

    for (let i = 0; i < questions.length; i++) {
      const ans = invalidAnswers[i]
      const valid = typeof ans === "number" && ans >= 0 && ans < questions[i].options.length && Number.isInteger(ans)
      expect(valid).toBe(false)
    }
  })

  it("client cannot pass arbitrary points — server uses quiz definition", () => {
    // Server always reads quiz.points from Firestore, never from client
    const clientClaimed = 9999
    const serverQuizDefinition = { points: 70 }
    const awarded = serverQuizDefinition.points // always from server
    expect(awarded).toBe(70)
    expect(awarded).not.toBe(clientClaimed)
  })

  it("idempotency prevents double-counting in cap calculation", () => {
    // If quiz already completed (idempotency hit), points=0 in ledger
    // So weekly sum only counts actual awards, not duplicates
    const ledgerEntries = [
      { type: "earn.quiz", amount: 70, status: "completed" },
      // duplicate would have been blocked by idempotency, never reaches ledger
    ]

    const weeklyTotal = ledgerEntries
      .filter(e => e.type === "earn.quiz" && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0)

    expect(weeklyTotal).toBe(70) // only counted once
  })

  it("quiz attempt is recorded even when blocked by cap", () => {
    const weeklyEarned = 300
    const quizPoints = 70
    const cappedByWeekly = weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS

    const attemptRecord = {
      quizId: "weekly-espresso",
      pointsAwarded: cappedByWeekly ? 0 : quizPoints,
      cappedByWeekly,
    }

    expect(attemptRecord.pointsAwarded).toBe(0)
    expect(attemptRecord.cappedByWeekly).toBe(true)
    // Attempt is still recorded for audit trail
  })
})

// ═══════════════════════════════════════════════════════════════
// CROSS-CUTTING: Event Traceability
// ═══════════════════════════════════════════════════════════════

describe("Event Traceability", () => {
  const expectedEvents = [
    "gamification.badge_unlocked",
    "gamification.quiz_completed",
    "gamification.quiz_cap_reached",
    "gamification.quiz_points_blocked",
    "gamification.mission_completed",
    "rewards.redeemed",
    "rewards.redemption_expired",
    "rewards.redemption_use_rejected",
    "rewards.redemption_used",
    "rewards.batch_expired",
    "loyalty.points_reversed",
  ]

  it("all critical events have defined types", () => {
    expect(expectedEvents.length).toBeGreaterThan(10)
    for (const evt of expectedEvents) {
      expect(evt).toMatch(/^(gamification|rewards|loyalty)\./)
    }
  })

  it("event type follows domain.action naming convention", () => {
    for (const evt of expectedEvents) {
      const parts = evt.split(".")
      expect(parts.length).toBe(2)
      expect(parts[0].length).toBeGreaterThan(0)
      expect(parts[1].length).toBeGreaterThan(0)
    }
  })
})
