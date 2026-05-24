/**
 * POST /api/org/:orgId/loyalty/expire-redemptions
 *
 * PR7: Batch-expire stale pending redemptions.
 * Can be called manually from Brain admin or by a scheduled job.
 *
 * Auth: Bearer token (staff only)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { expireStaleRedemptions } from "@/lib/loyalty-engine"

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
  const result = await expireStaleRedemptions(orgId)

  console.log(
    JSON.stringify({
      op: "redemption.expire_batch",
      orgId,
      expired: result.expired,
      errors: result.errors,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json({
    message: "Expiry sweep complete",
    ...result,
  })
}
