/**
 * POST /api/org/:orgId/loyalty/adjust — Manual point adjustment (staff only)
 *
 * Body: { uid, amount, reason }
 *   uid     — customer uid
 *   amount  — positive = add points, negative = deduct points
 *   reason  — human-readable reason (stored in ledger)
 *
 * Auth: staff only
 *
 * Use cases:
 *  - Deduct points for rewards given without going through the app redemption flow
 *    (e.g. galletas entregadas sin canje digital)
 *  - Manual compensation / correction
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { createLoyaltyTx } from "@/lib/loyalty-engine"

const MAX_ADJUSTMENT = 50000 // sanity cap

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

  if (!body.uid || typeof body.uid !== "string") {
    return NextResponse.json({ error: "uid (string) required" }, { status: 400 })
  }
  if (typeof body.amount !== "number" || !isFinite(body.amount) || body.amount === 0) {
    return NextResponse.json({ error: "amount (non-zero number) required" }, { status: 400 })
  }
  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length < 3) {
    return NextResponse.json({ error: "reason (string, min 3 chars) required" }, { status: 400 })
  }

  const amount = Math.round(body.amount as number)
  if (Math.abs(amount) > MAX_ADJUSTMENT) {
    return NextResponse.json({ error: `amount must be between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}` }, { status: 400 })
  }

  const reason = (body.reason as string).trim()

  // Use earn.manual for additions, reverse.manual for deductions
  // These existing types map to manual admin adjustments (credits and debits)
  const txType = amount > 0 ? "earn.manual" : "reverse.manual"

  // Idempotency key: unique per adjustment using timestamp + random suffix
  const idempSourceId = `manual:${caller.uid}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const result = await createLoyaltyTx({
    orgId,
    uid: body.uid as string,
    type: txType,
    amount,
    sourceType: amount > 0 ? "admin" : "system",
    sourceId: idempSourceId,
    description: amount > 0
      ? `Ajuste manual (+${amount} pts): ${reason}`
      : `Corrección manual (${amount} pts): ${reason}`,
    descriptionEn: amount > 0
      ? `Manual adjustment (+${amount} pts): ${reason}`
      : `Manual correction (${amount} pts): ${reason}`,
    metadata: {
      reason,
      adjustedBy: caller.uid,
      adjustment: amount,
    },
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "loyalty.adjust",
      orgId,
      uid: body.uid,
      amount,
      reason,
      balanceAfter: result.balanceAfter ?? null,
      result: result.success ? "success" : result.error,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
