/**
 * POST /api/org/:orgId/exam-pass/cancel-pending
 *
 * Cancela el pass `pending` del propio caller. Útil cuando el usuario
 * abandonó el pago a media (cerró pestaña, salió antes de confirmar) y
 * vuelve a la app: no queremos que se quede con un banner "confirmando"
 * para siempre.
 *
 * Auth: Bearer token (cualquier usuario autenticado, cancela LO SUYO).
 *
 * Body: vacío o `{}`. No aceptamos `passId` para evitar que un usuario
 * cancele bonos pending de otro: nos basamos en `caller.uid` y la query
 * que ya filtra por userId.
 *
 * Idempotente: si no hay pending, devuelve `{ ok: true, canceled: 0 }`.
 * Si hay varios (raro), cancela hasta `MAX_CANCEL_PER_CALL` para no
 * dejar nada colgado.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import {
  cancelPendingPass,
  getPendingExamPassForUser,
} from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"

const MAX_CANCEL_PER_CALL = 5

export async function POST(
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

  let canceled = 0
  for (let i = 0; i < MAX_CANCEL_PER_CALL; i++) {
    const pending = await getPendingExamPassForUser(caller.uid, orgId)
    if (!pending) break
    const result = await cancelPendingPass({
      passId: pending.id,
      reason: "user_canceled",
    })
    if (!result.ok) {
      // INVALID_STATE significa que dejó de estar pending mientras tanto
      // (race con webhook); no es fatal, salimos del loop.
      console.warn(
        JSON.stringify({
          op: "exam_pass.cancel_pending.skipped",
          passId: pending.id,
          userId: caller.uid,
          orgId,
          error: result.error,
        }),
      )
      break
    }
    canceled++
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.cancel_pending.done",
      userId: caller.uid,
      orgId,
      canceled,
    }),
  )

  return NextResponse.json({ ok: true, canceled })
}
