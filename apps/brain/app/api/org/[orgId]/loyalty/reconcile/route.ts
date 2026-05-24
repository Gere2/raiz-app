/**
 * GET /api/org/:orgId/loyalty/reconcile?uid=xxx — Reconcile balance for a user
 * POST /api/org/:orgId/loyalty/reconcile — Fix balance if mismatch detected
 *
 * GET: Compares cached balance on customer_profiles with sum of ledger.
 * POST: { uid } — If mismatch, creates a correction transaction to fix it.
 *
 * Auth: Staff only
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"

interface ReconcileResult {
  uid: string
  cachedBalance: number
  ledgerBalance: number
  match: boolean
  drift: number
  totalEarnFromLedger: number
  totalSpendFromLedger: number
  txCount: number
  correctionApplied?: boolean
  correctionTxId?: string
}

async function computeLedgerBalance(uid: string, orgId: string): Promise<{
  ledgerBalance: number
  totalEarn: number
  totalSpend: number
  txCount: number
}> {
  const txSnap = await adminDb
    .collection("loyalty_transactions")
    .where("uid", "==", uid)
    .where("orgId", "==", orgId)
    .where("status", "==", "completed")
    .get()

  let totalEarn = 0
  let totalSpend = 0

  for (const doc of txSnap.docs) {
    const data = doc.data()
    const amount = data.amount || 0
    if (amount > 0) totalEarn += amount
    else totalSpend += Math.abs(amount)
  }

  return {
    ledgerBalance: totalEarn - totalSpend,
    totalEarn,
    totalSpend,
    txCount: txSnap.size,
  }
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
  const uid = req.nextUrl.searchParams.get("uid")
  if (!uid) {
    return NextResponse.json({ error: "uid query param required" }, { status: 400 })
  }

  // Read cached balance
  const profileSnap = await adminDb.doc(`customer_profiles/${uid}`).get()
  const profile = profileSnap.data() || {}
  const cachedBalance = profile.loyaltyPoints || 0

  // Compute from ledger (scoped by orgId)
  const { ledgerBalance, totalEarn, totalSpend, txCount } = await computeLedgerBalance(uid, orgId)

  const drift = cachedBalance - ledgerBalance

  const result: ReconcileResult = {
    uid,
    cachedBalance,
    ledgerBalance,
    match: drift === 0,
    drift,
    totalEarnFromLedger: totalEarn,
    totalSpendFromLedger: totalSpend,
    txCount,
  }

  console.log(
    JSON.stringify({
      op: "loyalty.reconcile",
      orgId,
      uid,
      cachedBalance,
      ledgerBalance,
      drift,
      correctionApplied: false,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result)
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

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const uid = body.uid as string
  if (!uid || typeof uid !== "string") {
    return NextResponse.json({ error: "uid (string) required" }, { status: 400 })
  }

  // Read cached balance
  const profileSnap = await adminDb.doc(`customer_profiles/${uid}`).get()
  const profile = profileSnap.data() || {}
  const cachedBalance = profile.loyaltyPoints || 0

  // Compute from ledger (scoped by orgId)
  const { ledgerBalance, totalEarn, totalSpend, txCount } = await computeLedgerBalance(uid, orgId)

  const drift = cachedBalance - ledgerBalance

  if (drift === 0) {
    return NextResponse.json({
      uid,
      match: true,
      drift: 0,
      message: "Balance already correct, no correction needed",
    })
  }

  // Apply correction atomically: ledger entry + profile update in one transaction
  const now = new Date().toISOString()
  const correctionAmount = -drift // if cached is higher, we need negative correction
  const idempKey = `correction:reconcile:${uid}:${now.slice(0, 13)}` // per-hour idempotency

  const txRef = adminDb.collection("loyalty_transactions").doc()

  await adminDb.runTransaction(async (firestoreTx) => {
    firestoreTx.set(txRef, {
      orgId,
      uid,
      type: "correction",
      amount: correctionAmount,
      balanceAfter: ledgerBalance, // correct balance = ledger balance
      status: "completed",
      sourceType: "system",
      sourceId: `reconcile:${caller.uid}`,
      idempotencyKey: idempKey,
      description: `Corrección de saldo: drift de ${drift} pts`,
      descriptionEn: `Balance correction: drift of ${drift} pts`,
      metadata: {
        cachedBalance,
        ledgerBalance,
        drift,
        txCount,
        reconciledBy: caller.uid,
      },
      actorId: caller.uid,
      createdAt: now,
      processedAt: now,
    })

    firestoreTx.update(adminDb.doc(`customer_profiles/${uid}`), {
      loyaltyPoints: ledgerBalance,
      totalPointsEarned: totalEarn,
      totalPointsRedeemed: totalSpend,
      lastTxId: txRef.id,
      lastTxAt: now,
      updatedAt: now,
    })
  })

  console.log(
    JSON.stringify({
      op: "loyalty.reconcile",
      orgId,
      uid,
      cachedBalance,
      ledgerBalance,
      drift,
      correctionApplied: true,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({
    uid,
    match: false,
    drift,
    correctionApplied: true,
    correctionTxId: txRef.id,
    newBalance: ledgerBalance,
    message: `Balance corrected from ${cachedBalance} to ${ledgerBalance} (drift: ${drift})`,
  })
}
