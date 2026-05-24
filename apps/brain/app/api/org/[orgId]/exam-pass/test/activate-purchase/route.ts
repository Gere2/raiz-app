/**
 * POST /api/org/:orgId/exam-pass/test/activate-purchase
 *
 * Modo test — simula que Stripe ha confirmado el pago de un bono pendiente.
 *
 * - Solo responde si `ENABLE_EXAM_PASS_TEST_MODE === "true"` (server-side).
 * - Solo activa el pass si pertenece al usuario autenticado.
 * - Reusa `activateExamPassFromPayment` exactamente igual que el webhook real:
 *   misma transición pending → active, mismo incremento del contador
 *   early-bird, misma idempotencia.
 *
 * Body:
 *   { passId: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"
import {
  activateExamPassFromPayment,
} from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"
import {
  isExamPassTestModeEnabled,
  testModeDisabled,
} from "@/lib/exam-pass/test-mode"
import type { ExamPass } from "@/lib/exam-pass/types"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  if (!isExamPassTestModeEnabled()) return testModeDisabled()

  let caller
  try {
    caller = await requireAuth(req)
  } catch {
    return errorResponse("UNAUTHORIZED")
  }

  const { orgId } = await params
  if (!orgId) return errorResponse("INVALID_INPUT", { message: "orgId requerido" })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_INPUT", { message: "JSON inválido" })
  }
  const passId = body.passId
  if (typeof passId !== "string" || !passId) {
    return errorResponse("INVALID_INPUT", { message: "passId requerido" })
  }

  // Ownership: el bono debe pertenecer al usuario que llama. No queremos que
  // un usuario active bonos de otros aunque el modo test esté activo.
  const passSnap = await adminDb.collection("exam_passes").doc(passId).get()
  if (!passSnap.exists) {
    return errorResponse("PASS_NOT_FOUND")
  }
  const pass = passSnap.data() as ExamPass
  if (pass.userId !== caller.uid || pass.orgId !== orgId) {
    return errorResponse("UNAUTHORIZED", {
      message: "El bono no pertenece a este usuario u org",
    })
  }

  // Reusamos la engine real. paymentIntentId ficticio y amount = exactamente
  // lo que el engine espera (purchasePrice * 100). Si el pass ya tiene PI
  // asociado (purchase-init lo guardó) lo reusamos para que la verificación
  // PAYMENT_INTENT_MISMATCH no salte.
  const fakePaymentIntentId = pass.paymentIntentId ?? `test_pi_${pass.id}`
  const result = await activateExamPassFromPayment({
    passId,
    paymentIntentId: fakePaymentIntentId,
    paidAmountCents: pass.purchasePrice * 100,
  })

  if (!result.ok) {
    console.warn(
      JSON.stringify({
        op: "exam_pass.test.activate_purchase_failed",
        passId,
        error: result.error,
        userId: caller.uid,
      }),
    )
    return errorResponse(result.error, { message: "Activación de prueba falló" })
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.test.activate_purchase_ok",
      passId,
      alreadyActive: result.alreadyActive ?? false,
      userId: caller.uid,
      orgId,
    }),
  )

  return NextResponse.json({
    ok: true,
    pass: result.pass,
    alreadyActive: result.alreadyActive ?? false,
  })
}
