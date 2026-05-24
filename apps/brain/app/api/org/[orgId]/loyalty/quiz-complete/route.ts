/**
 * POST /api/org/:orgId/loyalty/quiz-complete — Complete a quiz (server-validated)
 *
 * Body: { uid, quizId, answers: number[] }
 * Auth: Bearer token (must be the user themselves)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { completeQuizServer } from "@/lib/loyalty-engine"

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

  if (!body.uid || !body.quizId || !Array.isArray(body.answers)) {
    return NextResponse.json({ error: "uid, quizId, answers[] required" }, { status: 400 })
  }

  // Security: only the user themselves
  if (body.uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await completeQuizServer({
    orgId,
    uid: body.uid,
    quizId: body.quizId,
    answers: body.answers,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "quiz.complete",
      orgId,
      uid: body.uid,
      quizId: body.quizId,
      pointsAwarded: result.pointsAwarded || 0,
      cappedByWeekly: result.cappedByWeekly || false,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
