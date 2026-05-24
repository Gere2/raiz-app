/**
 * GET /api/org/:orgId/loyalty/snapshot — Get latest economy snapshot
 * POST /api/org/:orgId/loyalty/snapshot — Create a new snapshot
 *
 * Snapshots are stored in orgs/{orgId}/loyalty_snapshots collection.
 * Useful for tracking economy state over time and detecting trends.
 *
 * Auth: Staff only
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"

interface LoyaltySnapshot {
  id?: string
  orgId: string
  totalPointsIssued: number
  totalPointsRedeemed: number
  pointsInCirculation: number
  activeRedemptions: {
    pending: number
    used: number
    expired: number
  }
  uniqueUsers: number
  createdAt: string
  createdBy: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden: staff only" }, { status: 403 })
  }

  const { orgId } = await params

  try {
    // ── Get latest snapshot ──
    const snapshotSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("loyalty_snapshots")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()

    if (snapshotSnap.empty) {
      return NextResponse.json(
        { error: "No snapshots found for this org" },
        { status: 404 },
      )
    }

    const latestSnap = snapshotSnap.docs[0]
    const snapshot = {
      id: latestSnap.id,
      ...latestSnap.data(),
    } as LoyaltySnapshot

    console.log(
      JSON.stringify({
        op: "loyalty.snapshot_get",
        orgId,
        snapshotId: snapshot.id,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )

    return NextResponse.json(snapshot)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(
      JSON.stringify({
        op: "loyalty.snapshot_get_error",
        orgId,
        error: errMsg,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )
    return NextResponse.json(
      { error: "Failed to retrieve snapshot", message: errMsg },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden: staff only" }, { status: 403 })
  }

  const { orgId } = await params

  try {
    // ── Aggregate current economy state ──
    const txSnap = await adminDb
      .collection("loyalty_transactions")
      .where("orgId", "==", orgId)
      .where("status", "==", "completed")
      .get()

    let totalIssued = 0
    let totalRedeemed = 0
    const uniqueUids = new Set<string>()

    for (const doc of txSnap.docs) {
      const data = doc.data()
      const amount = data.amount || 0
      const type = (data.type || "") as string

      uniqueUids.add(data.uid || "")

      if (type.startsWith("earn.")) {
        totalIssued += amount
      } else if (type.startsWith("redeem.")) {
        totalRedeemed += Math.abs(amount)
      } else if (type === "correction" && amount > 0) {
        totalIssued += amount
      } else if (type === "correction" && amount < 0) {
        totalRedeemed += Math.abs(amount)
      }
    }

    // ── Get redemption counts ──
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

    // ── Create snapshot ──
    const snapshot: LoyaltySnapshot = {
      orgId,
      totalPointsIssued: totalIssued,
      totalPointsRedeemed: totalRedeemed,
      pointsInCirculation: totalIssued - totalRedeemed,
      activeRedemptions,
      uniqueUsers: uniqueUids.size,
      createdAt: new Date().toISOString(),
      createdBy: caller.uid,
    }

    // ── Store in Firestore ──
    const snapshotRef = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("loyalty_snapshots")
      .add(snapshot)

    console.log(
      JSON.stringify({
        op: "loyalty.snapshot_create",
        orgId,
        snapshotId: snapshotRef.id,
        totalIssued,
        totalRedeemed,
        circulation: totalIssued - totalRedeemed,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )

    return NextResponse.json(
      {
        id: snapshotRef.id,
        ...snapshot,
      },
      { status: 201 },
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(
      JSON.stringify({
        op: "loyalty.snapshot_create_error",
        orgId,
        error: errMsg,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )
    return NextResponse.json(
      { error: "Failed to create snapshot", message: errMsg },
      { status: 500 },
    )
  }
}
