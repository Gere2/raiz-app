/**
 * API: GET /api/org/:orgId/customers
 *
 * PR5: HARDENED — all queries scoped by orgId.
 * customer_profiles uses orgId field for multi-org isolation.
 * No global reads. No cross-org leaks.
 *
 * Auth: requireAuth + requireOrgMember
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

const MAX_LIMIT = 200

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const url = new URL(req.url)
    const segment = url.searchParams.get("segment")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), MAX_LIMIT)
    const sortBy = url.searchParams.get("sortBy") || "totalSpent"

    // ── CRITICAL: Always scope by orgId ──
    // Requires orgId field on customer_profiles.
    // Migration note: existing docs without orgId need backfill.
    let baseQuery = adminDb.collection("customer_profiles")
      .where("orgId", "==", orgId)

    if (segment) {
      baseQuery = baseQuery.where("segment", "==", segment)
    }

    const snap = await baseQuery.limit(limit).get()
    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // ── Stats: also scoped by org, with pagination to avoid loading all customers ──
    // Load customer records for stats aggregation
    // TODO: For large organizations, consider:
    // 1. Using Firestore aggregation queries (count, sum) if available
    // 2. Pre-calculating stats in a separate summary document updated on each customer change
    // 3. Using a dedicated analytics service
    const STATS_LIMIT = 1000
    const allOrgSnap = await adminDb.collection("customer_profiles")
      .where("orgId", "==", orgId)
      .limit(STATS_LIMIT)
      .get()

    const segments: Record<string, number> = { new: 0, occasional: 0, regular: 0, loyal: 0, churning: 0 }
    let totalCustomers = 0
    let totalRevenue = 0
    let totalVisitsSum = 0
    let statsLimited = false

    allOrgSnap.forEach(d => {
      const data = d.data()
      const seg = data.segment || "new"
      if (segments[seg] !== undefined) segments[seg]++
      totalCustomers++
      totalRevenue += data.totalSpent || 0
      totalVisitsSum += data.totalVisits || 0
    })

    // Warn if stats are limited (more than STATS_LIMIT customers)
    if (allOrgSnap.size >= STATS_LIMIT) {
      statsLimited = true
    }

    const avgTicketGlobal = totalVisitsSum > 0 ? totalRevenue / totalVisitsSum : 0

    // Sorting in server
    type CustomerRecord = Record<string, unknown>
    const getNum = (obj: CustomerRecord, key: string) => Number(obj[key]) || 0
    if (sortBy === "totalSpent") {
      customers.sort((a: CustomerRecord, b: CustomerRecord) => getNum(b, "totalSpent") - getNum(a, "totalSpent"))
    } else if (sortBy === "totalVisits") {
      customers.sort((a: CustomerRecord, b: CustomerRecord) => getNum(b, "totalVisits") - getNum(a, "totalVisits"))
    } else if (sortBy === "loyaltyPoints") {
      customers.sort((a: CustomerRecord, b: CustomerRecord) => getNum(b, "loyaltyPoints") - getNum(a, "loyaltyPoints"))
    } else if (sortBy === "lastVisit") {
      customers.sort((a: CustomerRecord, b: CustomerRecord) => {
        const aTime = (a.lastVisit as Record<string, unknown> | undefined)?._seconds as number || 0
        const bTime = (b.lastVisit as Record<string, unknown> | undefined)?._seconds as number || 0
        return bTime - aTime
      })
    }

    return NextResponse.json({
      customers: customers.slice(0, limit),
      stats: {
        totalCustomers,
        totalRevenue,
        avgTicketGlobal,
        segments,
        statsLimited,
        statsNote: statsLimited ? `Stats calculated from first ${STATS_LIMIT} customers` : undefined,
      },
    })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
