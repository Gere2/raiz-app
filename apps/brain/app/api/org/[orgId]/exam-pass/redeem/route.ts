/**
 * POST /api/org/:orgId/exam-pass/redeem
 *
 * Canje del bono iniciado desde la app del cliente. Consume 1 crédito
 * inmediatamente y deja el suplemento (si lo hay) PENDIENTE de cobro en
 * barra. El barista cobra al entregar el café.
 *
 * Diseño: ya no hay Stripe en este flujo. La app construye el pedido,
 * confirma el resumen, y al instante el crédito queda consumido. El order
 * se crea en `orders` desde el cliente (en /bono/pedir/resumen) con
 * `paymentStatus: "PENDING"` cuando hay suplemento, "PAID" cuando no.
 *
 * Body:
 *   {
 *     productId: string,
 *     milkId?: string | null,
 *     extras?: string[],
 *     pastryId?: string | null
 *   }
 *
 * Resultado siempre síncrono:
 *   {
 *     ok: true,
 *     requiresInStorePayment: boolean,
 *     redemption: ExamPassRedemption (status="consumed"),
 *     pass: ExamPass,
 *     creditsAvailable: number,
 *     quote: ExamPassOrderQuote
 *   }
 *
 * Auth: Bearer token (cliente).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { redeemExamPassInStore } from "@/lib/exam-pass/engine"
import { computeOrder, creditsAvailable } from "@/lib/exam-pass/calc"
import {
  eligibilityToCode,
  errorResponse,
  orderErrorToCode,
} from "@/lib/exam-pass/http-errors"
import type {
  ExamPassOrderInput,
  OrderValidationError,
} from "@/lib/exam-pass/types"

function parseBody(body: unknown): ExamPassOrderInput | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>

  if (typeof b.productId !== "string") return null

  let milkId: string | null = null
  if (b.milkId != null) {
    if (typeof b.milkId !== "string") return null
    milkId = b.milkId
  }

  let extras: string[] = []
  if (b.extras != null) {
    if (!Array.isArray(b.extras)) return null
    if (!b.extras.every((e: unknown) => typeof e === "string")) return null
    extras = b.extras as string[]
  }

  let pastryId: string | null = null
  if (b.pastryId != null) {
    if (typeof b.pastryId !== "string") return null
    pastryId = b.pastryId
  }

  return {
    productId: b.productId as ExamPassOrderInput["productId"],
    milkId: milkId as ExamPassOrderInput["milkId"],
    extras: extras as ExamPassOrderInput["extras"],
    pastryId: pastryId as ExamPassOrderInput["pastryId"],
  }
}

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

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return errorResponse("INVALID_INPUT", { message: "JSON inválido" })
  }
  const input = parseBody(raw)
  if (!input) {
    return errorResponse("INVALID_INPUT", { message: "Shape de body inválido" })
  }

  // Pre-check puro para devolver error específico antes de tocar Firestore.
  const pre = computeOrder(input)
  if (!pre.ok) {
    return errorResponse(orderErrorToCode(pre.error))
  }

  // Consumo directo. Sin Stripe, sin reservas pendientes. Si hay suplemento,
  // el barista cobrará en barra y el order quedará PENDING hasta que el POS
  // lo marque PAID.
  const result = await redeemExamPassInStore({
    userId: caller.uid,
    orgId,
    input,
    source: "app",
  })

  if (!result.ok) {
    if (result.error === "INVALID_ORDER") {
      const orderErr = result.orderError as OrderValidationError | undefined
      if (orderErr) {
        return errorResponse(orderErrorToCode(orderErr), {
          message: result.orderError,
        })
      }
      return errorResponse("INVALID_INPUT", { message: result.orderError })
    }

    // ELIGIBILITY: pass no encontrado, expirado, sin créditos.
    const reason = result.eligibility?.reason
    if (!reason) return errorResponse("INVALID_INPUT")
    return errorResponse(eligibilityToCode(reason), {
      details: {
        creditsAvailable: result.eligibility?.creditsAvailable ?? 0,
        expiresAt: result.eligibility?.expiresAt ?? null,
      },
    })
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.app.redeemed",
      redemptionId: result.redemption.id,
      passId: result.pass.id,
      userId: caller.uid,
      orgId,
      productId: result.quote.productId,
      totalSupplement: result.quote.totalSupplement,
    }),
  )

  return NextResponse.json({
    ok: true,
    requiresInStorePayment: result.quote.totalSupplement > 0,
    redemption: result.redemption,
    pass: result.pass,
    creditsAvailable: creditsAvailable(result.pass),
    quote: result.quote,
  })
}
