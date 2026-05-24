/**
 * POST /api/org/:orgId/loyalty/mission-complete — Complete a mission (server-validated)
 *
 * Body: { uid, missionId }
 * Auth: Bearer token (must be the user)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { completeMissionServer } from "@/lib/loyalty-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params
  const body = await req.json()

  if (!body.uid || !body.missionId) {
    return NextResponse.json({ error: "uid, missionId required" }, { status: 400 })
  }

  if (body.uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await completeMissionServer({
    orgId,
    uid: body.uid,
    missionId: body.missionId,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "mission.complete",
      orgId,
      uid: body.uid,
      missionId: body.missionId,
      result: result.success ? "success" : result.error,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
