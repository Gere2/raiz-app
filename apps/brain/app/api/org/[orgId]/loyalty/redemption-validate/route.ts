/**
 * POST /api/org/:orgId/loyalty/redemption-validate
 *
 * PR7: Server-side redemption validation with expiry enforcement.
 * Used by POS to validate a code before marking it as used.
 *
 * Body: { code: string }
 * Auth: Bearer token (staff only — POS operators)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { validateRedemptionForUse } from "@/lib/loyalty-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json({ error: "code (string, 6 chars) required" }, { status: 400 })
  }

  const result = await validateRedemptionForUse(body.code as string, orgId)

  if (!result.valid) {
    console.log(
      JSON.stringify({
        op: "redemption.validate",
        orgId,
        code: body.code,
        result: result.error,
        actorId: caller.uid,
        ts: new Date().toISOString(),
      }),
    )
    return NextResponse.json({
      valid: false,
      error: result.error,
    }, { status: result.error === "REDEMPTION_EXPIRED" ? 410 : 404 })
  }

  console.log(
    JSON.stringify({
      op: "redemption.validate",
      orgId,
      code: body.code,
      result: "valid",
      redemptionId: result.redemption.id,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({
    valid: true,
    redemption: {
      id: result.redemption.id,
      rewardName: result.redemption.rewardName,
      rewardNameEn: result.redemption.rewardNameEn,
      pointsSpent: result.redemption.pointsSpent,
      code: result.redemption.code,
      expiresAt: result.redemption.expiresAt,
      createdAt: result.redemption.createdAt,
    },
  })
}
