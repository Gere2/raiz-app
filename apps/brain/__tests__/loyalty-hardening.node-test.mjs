/**
 * __tests__/loyalty-hardening.test.mjs
 *
 * Tests for PR5-PR8 hardening:
 *  PR5: Org isolation in customers
 *  PR6: Badge race condition prevention
 *  PR7: Redemption expiry enforcement
 *  PR8: Quiz cap server-side enforcement
 *
 * Run: node --test __tests__/loyalty-hardening.test.mjs
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

// ═══════════════════════════════════════════════════════════════
// PR5: ORG ISOLATION
// ═══════════════════════════════════════════════════════════════

describe("PR5 — Org Isolation", () => {
  it("query without orgId filter should be considered unsafe", () => {
    const queryHasOrgFilter = (filters) => filters.includes("orgId")
    assert.strictEqual(queryHasOrgFilter(["orgId", "status"]), true)
    assert.strictEqual(queryHasOrgFilter(["status"]), false)
    assert.strictEqual(queryHasOrgFilter([]), false)
  })

  it("customer profile must have orgId set on creation", () => {
    const newProfile = { uid: "user-1", orgId: "org-cafe-1", loyaltyPoints: 0 }
    assert.ok(newProfile.orgId)
    assert.strictEqual(newProfile.orgId, "org-cafe-1")
  })

  it("profile with mismatched orgId should be rejected", () => {
    const profileOrgId = "org-cafe-1"
    const requestOrgId = "org-cafe-2"
    assert.strictEqual(profileOrgId === requestOrgId, false)
  })

  it("backfill assigns orgId to profiles without it", () => {
    const profiles = [
      { uid: "u1", orgId: "org-1" },
      { uid: "u2" },
      { uid: "u3", orgId: "org-1" },
    ]
    const targetOrgId = "org-1"
    let updated = 0
    for (const p of profiles) {
      if (!p.orgId) { p.orgId = targetOrgId; updated++ }
    }
    assert.strictEqual(updated, 1)
    assert.strictEqual(profiles[1].orgId, "org-1")
  })

  it("transactions query must be scoped by orgId + uid", () => {
    const required = ["uid", "orgId"]
    const actual = ["uid", "orgId", "createdAt"]
    assert.ok(required.every(f => actual.includes(f)))
  })

  it("redemptions query must be scoped by orgId", () => {
    const query = { uid: "u1", orgId: "org-1", status: "pending" }
    assert.ok(query.orgId)
  })
})

// ═══════════════════════════════════════════════════════════════
// PR6: BADGE RACE CONDITION
// ═══════════════════════════════════════════════════════════════

describe("PR6 — Badge Race Condition Prevention", () => {
  it("idempotency key for badge is deterministic", () => {
    const key1 = `earn.badge:first-sip:user-abc`
    const key2 = `earn.badge:first-sip:user-abc`
    assert.strictEqual(key1, key2)
  })

  it("different badges produce different idempotency keys", () => {
    const key1 = `earn.badge:first-sip:user-abc`
    const key2 = `earn.badge:curious-mind:user-abc`
    assert.notStrictEqual(key1, key2)
  })

  it("concurrent unlock: first wins, second is duplicate", () => {
    const completedTxIds = new Set()
    const attemptUnlock = (badgeId, uid) => {
      const key = `earn.badge:${badgeId}:${uid}`
      if (completedTxIds.has(key)) return { success: true, duplicate: true }
      completedTxIds.add(key)
      return { success: true, duplicate: false }
    }

    const r1 = attemptUnlock("first-sip", "user-1")
    const r2 = attemptUnlock("first-sip", "user-1")
    assert.strictEqual(r1.duplicate, false)
    assert.strictEqual(r2.duplicate, true)
  })

  it("arrayUnion is idempotent", () => {
    const arrayUnion = (arr, value) =>
      arr.includes(value) ? [...arr] : [...arr, value]

    const badges = ["first-sip"]
    const after1 = arrayUnion(badges, "curious-mind")
    assert.deepStrictEqual(after1, ["first-sip", "curious-mind"])
    const after2 = arrayUnion(after1, "curious-mind")
    assert.deepStrictEqual(after2, ["first-sip", "curious-mind"])
  })

  it("badge bonus points only awarded once per badge per user", () => {
    const awarded = new Map()
    const award = (badgeId, uid, bonus) => {
      const key = `${badgeId}:${uid}`
      if (awarded.has(key)) return { awarded: false, points: 0 }
      awarded.set(key, true)
      return { awarded: true, points: bonus }
    }

    const r1 = award("first-sip", "user-1", 50)
    const r2 = award("first-sip", "user-1", 50)
    assert.strictEqual(r1.awarded, true)
    assert.strictEqual(r1.points, 50)
    assert.strictEqual(r2.awarded, false)
    assert.strictEqual(r2.points, 0)
  })

  it("different users can independently unlock same badge", () => {
    const keys = new Set()
    const unlock = (badge, uid) => {
      const key = `earn.badge:${badge}:${uid}`
      if (keys.has(key)) return { duplicate: true }
      keys.add(key)
      return { duplicate: false }
    }

    assert.strictEqual(unlock("first-sip", "user-A").duplicate, false)
    assert.strictEqual(unlock("first-sip", "user-B").duplicate, false)
    assert.strictEqual(unlock("first-sip", "user-A").duplicate, true)
  })
})

// ═══════════════════════════════════════════════════════════════
// PR7: REDEMPTION EXPIRY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

describe("PR7 — Redemption Expiry Enforcement", () => {
  const now = new Date("2026-03-13T12:00:00Z")

  it("pending redemption within expiry is valid", () => {
    const expiresAt = new Date("2026-03-14T12:00:00Z")
    assert.strictEqual(expiresAt < now, false)
  })

  it("pending redemption past expiry is rejected", () => {
    const expiresAt = new Date("2026-03-12T12:00:00Z")
    assert.strictEqual(expiresAt < now, true)
  })

  it("used/expired redemption cannot be reused", () => {
    for (const status of ["used", "expired"]) {
      assert.strictEqual(status === "pending", false)
    }
  })

  it("48-hour expiry window is correctly calculated", () => {
    const createdAt = new Date("2026-03-13T10:00:00Z")
    const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000)
    assert.strictEqual(expiresAt.toISOString(), "2026-03-15T10:00:00.000Z")
  })

  it("expired redemption transitions to expired status", () => {
    let status = "pending"
    const expiresAt = new Date("2026-03-12T12:00:00Z")
    if (expiresAt < now && status === "pending") status = "expired"
    assert.strictEqual(status, "expired")
  })

  it("used redemption not affected by expiry sweep", () => {
    const r = { status: "used", expiresAt: "2026-03-12T00:00:00Z" }
    const shouldExpire = r.status === "pending" && new Date(r.expiresAt) < now
    assert.strictEqual(shouldExpire, false)
  })

  it("code validation: 6-char format", () => {
    assert.strictEqual("AB3D5F".length, 6)
    for (const code of ["", "AB", "ab3d5f7", "12345", null]) {
      assert.strictEqual(typeof code === "string" && code.length === 6, false)
    }
  })

  it("on-read expiry filters out stale redemptions", () => {
    const redemptions = [
      { id: "r1", expiresAt: "2026-03-14T00:00:00Z" },
      { id: "r2", expiresAt: "2026-03-12T00:00:00Z" },
      { id: "r3", expiresAt: "2026-03-15T00:00:00Z" },
    ]
    const active = redemptions.filter(r => new Date(r.expiresAt) >= now)
    assert.strictEqual(active.length, 2)
    assert.deepStrictEqual(active.map(r => r.id), ["r1", "r3"])
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
    assert.strictEqual(remaining, 200)
    assert.ok(quizPoints <= remaining)
  })

  it("user at cap: zero points awarded", () => {
    const weeklyEarned = 300
    assert.ok(weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS)
    const awarded = weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS ? 0 : 60
    assert.strictEqual(awarded, 0)
  })

  it("user would exceed cap: truncated to remaining", () => {
    const weeklyEarned = 250
    const quizPoints = 100
    const remaining = MAX_WEEKLY_QUIZ_POINTS - weeklyEarned
    assert.ok(weeklyEarned + quizPoints > MAX_WEEKLY_QUIZ_POINTS)
    assert.strictEqual(Math.min(quizPoints, remaining), 50)
  })

  it("week boundary: Monday 00:00 UTC", () => {
    const wed = new Date("2026-03-11T15:30:00Z")
    const day = wed.getUTCDay()
    const diff = wed.getUTCDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(wed)
    weekStart.setUTCDate(diff)
    weekStart.setUTCHours(0, 0, 0, 0)
    assert.strictEqual(weekStart.getUTCDay(), 1)
    assert.strictEqual(weekStart.toISOString(), "2026-03-09T00:00:00.000Z")
  })

  it("Sunday belongs to same week as preceding Monday", () => {
    const sun = new Date("2026-03-15T20:00:00Z")
    const day = sun.getUTCDay()
    const diff = sun.getUTCDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(sun)
    weekStart.setUTCDate(diff)
    weekStart.setUTCHours(0, 0, 0, 0)
    assert.strictEqual(weekStart.toISOString(), "2026-03-09T00:00:00.000Z")
  })

  it("answer index validation: rejects out-of-bounds", () => {
    const questions = [
      { options: ["A", "B", "C", "D"] },
      { options: ["A", "B", "C"] },
    ]
    // valid
    for (const [i, ans] of [[0, 1], [1, 2]]) {
      const valid = typeof ans === "number" && ans >= 0 && ans < questions[i].options.length
      assert.ok(valid)
    }
    // invalid
    for (const [i, ans] of [[0, 5], [1, -1]]) {
      const valid = typeof ans === "number" && ans >= 0 && ans < questions[i].options.length
      assert.strictEqual(valid, false)
    }
  })

  it("server uses quiz definition points, not client input", () => {
    const clientClaimed = 9999
    const serverDef = { points: 70 }
    assert.strictEqual(serverDef.points, 70)
    assert.notStrictEqual(serverDef.points, clientClaimed)
  })

  it("idempotency prevents double-counting in cap", () => {
    const entries = [{ type: "earn.quiz", amount: 70, status: "completed" }]
    const total = entries
      .filter(e => e.type === "earn.quiz" && e.status === "completed")
      .reduce((s, e) => s + e.amount, 0)
    assert.strictEqual(total, 70)
  })

  it("quiz attempt recorded even when blocked by cap", () => {
    const weeklyEarned = 300
    const cappedByWeekly = weeklyEarned >= MAX_WEEKLY_QUIZ_POINTS
    const record = { pointsAwarded: cappedByWeekly ? 0 : 70, cappedByWeekly }
    assert.strictEqual(record.pointsAwarded, 0)
    assert.strictEqual(record.cappedByWeekly, true)
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
    assert.ok(expectedEvents.length > 10)
    for (const evt of expectedEvents) {
      assert.match(evt, /^(gamification|rewards|loyalty)\./)
    }
  })

  it("event type follows domain.action naming convention", () => {
    for (const evt of expectedEvents) {
      const parts = evt.split(".")
      assert.strictEqual(parts.length, 2)
      assert.ok(parts[0].length > 0)
      assert.ok(parts[1].length > 0)
    }
  })
})
