/**
 * POST /api/org/:orgId/loyalty/redeem — Redeem a reward
 *
 * Body: { uid, rewardId }
 * Auth: Bearer token (user themselves or staff)
 *
 * Hardened: input validation, safe JSON parse
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { redeemRewardServer } from "@/lib/loyalty-engine"

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

  if (!body.uid || typeof body.uid !== "string") {
    return NextResponse.json({ error: "uid (string) required" }, { status: 400 })
  }
  if (!body.rewardId || typeof body.rewardId !== "string") {
    return NextResponse.json({ error: "rewardId (string) required" }, { status: 400 })
  }

  // Security: only the user themselves or staff can redeem
  if (body.uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await redeemRewardServer({
    orgId,
    uid: body.uid as string,
    rewardId: body.rewardId as string,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "loyalty.redeem",
      orgId,
      uid: body.uid,
      rewardId: body.rewardId,
      balanceAfter: result.balanceAfter ?? null,
      redemptionId: result.redemptionId ?? null,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
