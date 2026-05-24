/**
 * POST /api/org/:orgId/loyalty/redemption-use
 *
 * PR7: Server-side redemption marking with expiry enforcement.
 * Called by POS after barista confirms the redemption.
 *
 * Body: { redemptionId: string }
 * Auth: Bearer token (staff only)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { markRedemptionUsedServer } from "@/lib/loyalty-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only staff can mark redemptions as used
  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden: staff only" }, { status: 403 })
  }

  const { orgId } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.redemptionId || typeof body.redemptionId !== "string") {
    return NextResponse.json({ error: "redemptionId (string) required" }, { status: 400 })
  }

  const result = await markRedemptionUsedServer(
    body.redemptionId as string,
    orgId,
    caller.uid,
  )

  if (!result.success) {
    console.log(
      JSON.stringify({
        op: "redemption.use",
        orgId,
        redemptionId: body.redemptionId,
        result: result.error,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )
    const status = result.error === "REDEMPTION_EXPIRED" ? 410
      : result.error === "ORG_MISMATCH" ? 403
      : 400
    return NextResponse.json(result, { status })
  }

  console.log(
    JSON.stringify({
      op: "redemption.use",
      orgId,
      redemptionId: body.redemptionId,
      result: "success",
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({ success: true })
}
