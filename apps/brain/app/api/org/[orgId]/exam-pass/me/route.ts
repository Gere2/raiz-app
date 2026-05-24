/**
 * GET /api/org/:orgId/exam-pass/me
 *
 * Devuelve el estado del bono del usuario autenticado en esta org.
 *
 *   { state: "active",  pass, creditsAvailable }
 *   { state: "pending", pass }                       // pago aún no confirmado
 *   { state: "none" }                                // no tiene bono
 *
 * Auth: Bearer token. La regla Firestore ya permite al owner leer su pass,
 * pero esta ruta es la API canónica: añade `creditsAvailable` calculado para
 * que la UI no haga lecturas extra.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import {
  getActiveExamPassForUser,
  getPendingExamPassForUser,
} from "@/lib/exam-pass/engine"
import { creditsAvailable } from "@/lib/exam-pass/calc"
import { errorResponse } from "@/lib/exam-pass/http-errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try {
    caller = await requireAuth(req)
  } catch {
    return errorResponse("UNAUTHORIZED")
  }

  const { orgId } = await params
  if (!orgId) return errorResponse("INVALID_INPUT", { message: "orgId requerido" })

  try {
    const active = await getActiveExamPassForUser(caller.uid, orgId)
    if (active) {
      return NextResponse.json({
        state: "active" as const,
        pass: active,
        creditsAvailable: creditsAvailable(active),
      })
    }

    const pending = await getPendingExamPassForUser(caller.uid, orgId)
    if (pending) {
      return NextResponse.json({
        state: "pending" as const,
        pass: pending,
      })
    }

    return NextResponse.json({ state: "none" as const })
  } catch (err) {
    console.error("[exam-pass/me] error:", err)
    return errorResponse("INTERNAL_ERROR")
  }
}
