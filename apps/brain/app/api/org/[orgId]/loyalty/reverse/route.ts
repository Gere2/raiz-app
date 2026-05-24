/**
 * POST /api/org/:orgId/loyalty/reverse — Reverse a transaction
 *
 * Body: { uid, originalTxId, reason }
 * Auth: Bearer token (staff only)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { reverseTransaction } from "@/lib/loyalty-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Staff only for reversals
  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden: staff only" }, { status: 403 })
  }

  const { orgId } = await params
  // MEDIA #8: Wrap JSON parsing in try-catch and add type validation
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
  }

  if (typeof body.uid !== 'string' || typeof body.originalTxId !== 'string' || typeof body.reason !== 'string') {
    return NextResponse.json({ error: "uid, originalTxId, reason must be strings" }, { status: 400 })
  }

  if (!body.uid || !body.originalTxId || !body.reason) {
    return NextResponse.json({ error: "uid, originalTxId, reason required" }, { status: 400 })
  }

  const result = await reverseTransaction({
    orgId,
    uid: body.uid,
    originalTxId: body.originalTxId,
    reason: body.reason,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "loyalty.reverse",
      orgId,
      uid: body.uid,
      originalTxId: body.originalTxId,
      result: result.success ? "success" : result.error,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
