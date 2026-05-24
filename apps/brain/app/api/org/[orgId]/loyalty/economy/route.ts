/**
 * GET /api/org/:orgId/loyalty/economy — Loyalty economy dashboard
 *
 * Returns aggregate metrics:
 * - Total points issued (all time)
 * - Total points redeemed
 * - Points in circulation
 * - Estimated liability (€ passivo)
 * - Earn sources breakdown
 * - Redemption sinks breakdown
 * - Breakage estimate
 * - Active redemptions pending
 *
 * Auth: Staff only
 *
 * Query params:
 *   ?from=2024-01-01&to=2024-12-31  (optional date range, defaults to all time)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireOrgMember } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"

interface EconomyMetrics {
  totalPointsIssued: number
  totalPointsRedeemed: number
  totalPointsReversed: number
  pointsInCirculation: number
  estimatedLiabilityEur: number // pts ÷ 100
  earnSources: Record<string, { count: number; points: number }>
  redemptionSinks: Record<string, { count: number; points: number }>
  transactionCount: number
  uniqueUsers: number
  activeRedemptions: { pending: number; used: number; expired: number }
  breakageEstimate: {
    inactiveUsers30d: number
    pointsAtRisk: number
  }
  period: { from: string | null; to: string | null }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  let caller
  try { caller = await requireOrgMember(req, orgId) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const from = req.nextUrl.searchParams.get("from") || null
  const to = req.nextUrl.searchParams.get("to") || null

  // ── 1. Aggregate loyalty_transactions ──
  let txQuery = adminDb
    .collection("loyalty_transactions")
    .where("orgId", "==", orgId)
    .where("status", "==", "completed")

  // Note: date range requires composite index on (orgId, status, createdAt)
  // For now we filter in-memory to avoid requiring new indexes
  const txSnap = await txQuery.get()

  let totalIssued = 0
  let totalRedeemed = 0
  let totalReversed = 0
  const earnSources: Record<string, { count: number; points: number }> = {}
  const redemptionSinks: Record<string, { count: number; points: number }> = {}
  const uniqueUids = new Set<string>()
  let filteredCount = 0

  for (const doc of txSnap.docs) {
    const data = doc.data()

    // Apply date filter if specified
    if (from && data.createdAt < from) continue
    if (to && data.createdAt > to) continue
    filteredCount++

    const amount = data.amount || 0
    const type = (data.type || "") as string
    uniqueUids.add(data.uid || "")

    if (type.startsWith("earn.")) {
      totalIssued += amount
      const source = type.replace("earn.", "")
      if (!earnSources[source]) earnSources[source] = { count: 0, points: 0 }
      earnSources[source].count++
      earnSources[source].points += amount
    } else if (type.startsWith("redeem.")) {
      totalRedeemed += Math.abs(amount)
      const sink = type.replace("redeem.", "")
      if (!redemptionSinks[sink]) redemptionSinks[sink] = { count: 0, points: 0 }
      redemptionSinks[sink].count++
      redemptionSinks[sink].points += Math.abs(amount)
    } else if (type.startsWith("reverse.")) {
      totalReversed += Math.abs(amount)
    } else if (type === "correction") {
      // Corrections can be positive or negative
      if (amount > 0) totalIssued += amount
      else totalRedeemed += Math.abs(amount)
    }
  }

  const pointsInCirculation = totalIssued - totalRedeemed - totalReversed

  // ── 2. Redemption statuses ──
  const redemptionSnap = await adminDb
    .collection("redemptions")
    .where("orgId", "==", orgId)
    .get()

  const activeRedemptions = { pending: 0, used: 0, expired: 0 }
  for (const doc of redemptionSnap.docs) {
    const status = doc.data().status as string
    if (status === "pending") activeRedemptions.pending++
    else if (status === "used") activeRedemptions.used++
    else if (status === "expired") activeRedemptions.expired++
  }

  // ── 3. Breakage estimate (users inactive 30+ days with positive balance) ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const profileSnap = await adminDb
    .collection("customer_profiles")
    .where("orgId", "==", orgId)
    .where("loyaltyPoints", ">", 0)
    .get()

  let inactiveUsers30d = 0
  let pointsAtRisk = 0

  for (const doc of profileSnap.docs) {
    const data = doc.data()
    const lastActivity = data.lastTxAt || data.updatedAt || ""
    if (lastActivity && lastActivity < thirtyDaysAgo) {
      inactiveUsers30d++
      pointsAtRisk += data.loyaltyPoints || 0
    }
  }

  // ── Result ──
  const metrics: EconomyMetrics = {
    totalPointsIssued: totalIssued,
    totalPointsRedeemed: totalRedeemed,
    totalPointsReversed: totalReversed,
    pointsInCirculation,
    estimatedLiabilityEur: pointsInCirculation / 100,
    earnSources,
    redemptionSinks,
    transactionCount: filteredCount,
    uniqueUsers: uniqueUids.size,
    activeRedemptions,
    breakageEstimate: {
      inactiveUsers30d,
      pointsAtRisk,
    },
    period: { from, to },
  }

  console.log(
    JSON.stringify({
      op: "loyalty.economy",
      orgId,
      totalIssued,
      totalRedeemed,
      circulation: pointsInCirculation,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(metrics)
}
