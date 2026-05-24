/**
 * POST /api/org/:orgId/loyalty/missions-reconcile — Auto-complete pending missions
 *
 * Reconciles any missions whose criteria are already met but haven't been
 * registered in completedMissions yet. Intended to be called when the app
 * opens, so the user gets their points even if a previous mission-completion
 * side-effect was missed.
 *
 * Body: { uid }
 * Auth: Bearer token (must be the user themselves or staff)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { reconcilePendingMissions } from "@/lib/loyalty-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try {
    caller = await requireAuth(req)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params
  const body = await req.json().catch(() => ({}))
  const uid = body.uid || caller.uid

  if (uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await reconcilePendingMissions({
    orgId,
    uid,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "mission.reconcile",
      orgId,
      uid,
      completedCount: result.completedMissionIds.length,
      totalAwarded: result.totalAwarded,
      errorCount: result.errors?.length || 0,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
