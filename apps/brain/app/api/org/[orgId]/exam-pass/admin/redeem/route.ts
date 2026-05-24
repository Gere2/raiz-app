/**
 * POST /api/org/:orgId/exam-pass/admin/redeem
 *
 * Canje físico desde el POS — el barista cobra suplementos en barra, sirve
 * el café y consumimos 1 crédito del bono. Síncrono (no usa Stripe).
 *
 * Auth: requiere staff.
 *
 * Body:
 *   {
 *     userId: string,                          // UID Firebase del cliente
 *     productId: string,                       // bebida del catálogo bono
 *     milkId?: string,                         // si la bebida lleva leche
 *     extras?: string[],                       // ids de extras opcionales
 *     pastryId?: string,                       // id de pastry opcional
 *     paymentMethod: "cash" | "card_terminal", // cómo cobra el barista
 *     note?: string                            // libre
 *   }
 *
 * Errores:
 *   401 UNAUTHORIZED         — token inválido / no staff
 *   400 INVALID_INPUT        — body roto
 *   400 PRODUCT_NOT_FOUND    — productId desconocido
 *   400 INVALID_SELECTION    — leche en bebida sin leche, iced redundante, etc.
 *   404 NO_ACTIVE_PASS       — el cliente no tiene bono activo
 *   409 PASS_EXPIRED         — el bono caducó
 *   409 NO_CREDITS           — sin créditos disponibles
 */
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/require-staff"
import { AuthError } from "@/lib/require-auth"
import { redeemExamPassInStore } from "@/lib/exam-pass/engine"
import {
  eligibilityToCode,
  errorResponse,
  orderErrorToCode,
} from "@/lib/exam-pass/http-errors"
import type {
  ExamPassOrderInput,
  OrderValidationError,
} from "@/lib/exam-pass/types"

interface ParsedBody {
  input: ExamPassOrderInput
  paymentMethod: "cash" | "card_terminal"
  note?: string
}

function parseBody(raw: unknown): { ok: true; data: ParsedBody; userId: string } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "Body inválido" }
  }
  const b = raw as Record<string, unknown>

  if (typeof b.userId !== "string" || !b.userId) {
    return { ok: false, reason: "userId requerido" }
  }
  if (typeof b.productId !== "string" || !b.productId) {
    return { ok: false, reason: "productId requerido" }
  }
  if (b.paymentMethod !== "cash" && b.paymentMethod !== "card_terminal") {
    return { ok: false, reason: "paymentMethod debe ser cash o card_terminal" }
  }

  let milkId: string | null = null
  if (b.milkId != null) {
    if (typeof b.milkId !== "string") return { ok: false, reason: "milkId inválido" }
    milkId = b.milkId
  }

  let extras: string[] = []
  if (b.extras != null) {
    if (!Array.isArray(b.extras)) return { ok: false, reason: "extras debe ser array" }
    if (!b.extras.every((e) => typeof e === "string"))
      return { ok: false, reason: "extras debe contener strings" }
    extras = b.extras as string[]
  }

  let pastryId: string | null = null
  if (b.pastryId != null) {
    if (typeof b.pastryId !== "string") return { ok: false, reason: "pastryId inválido" }
    pastryId = b.pastryId
  }

  if (b.note !== undefined && typeof b.note !== "string") {
    return { ok: false, reason: "note debe ser string" }
  }

  return {
    ok: true,
    userId: b.userId,
    data: {
      input: {
        productId: b.productId as ExamPassOrderInput["productId"],
        milkId: milkId as ExamPassOrderInput["milkId"],
        extras: extras as ExamPassOrderInput["extras"],
        pastryId: pastryId as ExamPassOrderInput["pastryId"],
      },
      paymentMethod: b.paymentMethod,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : undefined,
    },
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let staff
  try {
    staff = await requireStaff(req)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message: err.message },
        { status: err.status },
      )
    }
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
  const parsed = parseBody(raw)
  if (!parsed.ok) {
    return errorResponse("INVALID_INPUT", { message: parsed.reason })
  }

  const result = await redeemExamPassInStore({
    orgId,
    userId: parsed.userId,
    input: parsed.data.input,
    paymentMethod: parsed.data.paymentMethod,
    staffId: staff.uid,
    note: parsed.data.note,
  })

  if (!result.ok) {
    if (result.error === "INVALID_ORDER") {
      // orderError viene de OrderValidationError (puede ser "PRODUCT_NOT_FOUND",
      // "MILK_INVALID", etc.) o de un INVALID_STATE de consume si raceó.
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
      op: "exam_pass.in_store.redeemed",
      redemptionId: result.redemption.id,
      passId: result.pass.id,
      userId: parsed.userId,
      orgId,
      productId: result.quote.productId,
      totalSupplement: result.quote.totalSupplement,
      paymentMethod: parsed.data.paymentMethod,
      staffId: staff.uid,
    }),
  )

  return NextResponse.json({
    ok: true,
    redemption: result.redemption,
    pass: result.pass,
    quote: result.quote,
  })
}
