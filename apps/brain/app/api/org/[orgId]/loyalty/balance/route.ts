/**
 * GET /api/org/:orgId/loyalty/balance?uid=xxx — Get balance + recent transactions
 *
 * PR5: Scoped by orgId in transactions and redemptions queries.
 * PR7: Active redemptions are filtered for expiry on-read.
 *
 * Auth: Bearer token (user themselves or staff)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params
  const uid = req.nextUrl.searchParams.get("uid") || caller.uid

  // Security: user can only see their own, staff can see anyone
  if (uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get cached balance from profile
  const profileSnap = await adminDb.doc(`customer_profiles/${uid}`).get()
  const profile = profileSnap.data() || {}

  // PR5: Verify profile belongs to this org. If legacy profile (no orgId), backfill it first.
  if (!profile.orgId) {
    // Legacy profile without orgId: backfill it
    await adminDb.doc(`customer_profiles/${uid}`).update({ orgId })
  } else if (profile.orgId !== orgId) {
    // Profile belongs to a different org
    return NextResponse.json({ error: "Forbidden: org mismatch" }, { status: 403 })
  }

  // PR5: Get recent transactions scoped by org
  const txSnap = await adminDb
    .collection("loyalty_transactions")
    .where("uid", "==", uid)
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get()

  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // PR5 + PR7: Get active redemptions scoped by org, with on-read expiry filtering
  const redemptionSnap = await adminDb
    .collection("redemptions")
    .where("uid", "==", uid)
    .where("orgId", "==", orgId)
    .where("status", "==", "pending")
    .get()

  const now = new Date()
  const activeRedemptions: any[] = []
  const expiredOnRead: string[] = []

  for (const d of redemptionSnap.docs) {
    const data = d.data()
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null

    if (expiresAt && expiresAt < now) {
      // PR7: Auto-expire on read (best-effort, non-blocking)
      expiredOnRead.push(d.id)
      // MEDIA #12: Improved error logging with structured info
      adminDb.doc(`redemptions/${d.id}`).update({
        status: "expired",
        expiredAt: now.toISOString(),
      }).catch(err => console.error("[Loyalty] expiry update failed:", { redemptionId: d.id, error: err })) // fire and forget with error logging
    } else {
      activeRedemptions.push({ id: d.id, ...data })
    }
  }

  const balance = profile.loyaltyPoints || 0

  console.log(
    JSON.stringify({
      op: "loyalty.balance",
      orgId,
      uid,
      balance,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({
    balance: {
      loyaltyPoints: balance,
      totalPointsEarned: profile.totalPointsEarned || 0,
      totalPointsRedeemed: profile.totalPointsRedeemed || 0,
    },
    transactions,
    activeRedemptions,
    ...(expiredOnRead.length > 0 ? { expiredOnRead: expiredOnRead.length } : {}),
  })
}
