/**
 * POST /api/org/:orgId/exam-pass/test/consume-redemption
 *
 * Modo test — simula que Stripe ha confirmado el pago del suplemento de un
 * canje, y consume el crédito reservado.
 *
 * - Solo responde si `ENABLE_EXAM_PASS_TEST_MODE === "true"`.
 * - Solo consume si la redemption pertenece al usuario autenticado.
 * - Reusa `consumeRedemption` igual que el webhook real (idempotente,
 *   reserved → consumed, creditsReserved -1, creditsUsed +1).
 *
 * Body:
 *   { redemptionId: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"
import { consumeRedemption } from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"
import {
  isExamPassTestModeEnabled,
  testModeDisabled,
} from "@/lib/exam-pass/test-mode"
import type { ExamPassRedemption } from "@/lib/exam-pass/types"

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
  const redemptionId = body.redemptionId
  if (typeof redemptionId !== "string" || !redemptionId) {
    return errorResponse("INVALID_INPUT", { message: "redemptionId requerido" })
  }

  // Ownership: la redemption debe ser del caller en esta org.
  const redSnap = await adminDb
    .collection("exam_pass_redemptions")
    .doc(redemptionId)
    .get()
  if (!redSnap.exists) return errorResponse("REDEMPTION_NOT_FOUND")
  const red = redSnap.data() as ExamPassRedemption
  if (red.userId !== caller.uid || red.orgId !== orgId) {
    return errorResponse("UNAUTHORIZED", {
      message: "El canje no pertenece a este usuario u org",
    })
  }

  const fakePaymentIntentId = `test_pi_${red.id}`
  const result = await consumeRedemption({
    redemptionId,
    paymentIntentId: fakePaymentIntentId,
  })

  if (!result.ok) {
    console.warn(
      JSON.stringify({
        op: "exam_pass.test.consume_redemption_failed",
        redemptionId,
        error: result.error,
        userId: caller.uid,
      }),
    )
    return errorResponse(result.error, { message: "Consumo de prueba falló" })
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.test.consume_redemption_ok",
      redemptionId,
      alreadyConsumed: result.alreadyConsumed ?? false,
      userId: caller.uid,
      orgId,
    }),
  )

  return NextResponse.json({
    ok: true,
    redemption: result.redemption,
    pass: result.pass,
    alreadyConsumed: result.alreadyConsumed ?? false,
  })
}
