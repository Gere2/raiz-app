/**
 * POST /api/org/:orgId/exam-pass/admin/grant
 *
 * Activa un bono cobrado FÍSICAMENTE en tienda (datáfono o efectivo).
 * Llamado por el POS cuando el barista cobra al cliente. Salta Stripe.
 *
 * Auth: requiere staff (admin / vendedor / employee).
 *
 * Body:
 *   {
 *     userId: string,                          // UID Firebase del cliente
 *     paymentMethod: "cash" | "card_terminal",
 *     note?: string                            // libre, ej. "promo octubre"
 *   }
 *
 * Errores:
 *   401 UNAUTHORIZED      — token inválido / no staff
 *   400 INVALID_INPUT     — falta userId o paymentMethod inválido
 *   409 ACTIVE_PASS_EXISTS— el cliente ya tiene un bono activo
 */
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/require-staff"
import { AuthError } from "@/lib/require-auth"
import { grantExamPassInStore } from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"

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
  if (!orgId) {
    return errorResponse("INVALID_INPUT", { message: "orgId requerido" })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_INPUT", { message: "JSON inválido" })
  }

  const userId = body.userId
  const paymentMethod = body.paymentMethod
  const note = body.note

  if (typeof userId !== "string" || !userId) {
    return errorResponse("INVALID_INPUT", { message: "userId requerido" })
  }
  if (paymentMethod !== "cash" && paymentMethod !== "card_terminal") {
    return errorResponse("INVALID_INPUT", {
      message: "paymentMethod debe ser 'cash' o 'card_terminal'",
    })
  }
  if (note !== undefined && typeof note !== "string") {
    return errorResponse("INVALID_INPUT", { message: "note debe ser string" })
  }

  const result = await grantExamPassInStore({
    orgId,
    userId,
    paymentMethod,
    grantedByStaffId: staff.uid,
    note: typeof note === "string" && note.trim() ? note.trim() : undefined,
  })

  if (!result.ok) {
    if (result.error === "ACTIVE_PASS_EXISTS") {
      // Pasamos el pass existente como `details` para que el toast del POS
      // muestre créditos restantes y expiración — sin obligar a otra llamada.
      const p = result.existingPass
      return errorResponse("ACTIVE_PASS_EXISTS", {
        message: "El cliente ya tiene un bono activo",
        details: {
          existingPassId: p.id,
          creditsUsed: p.creditsUsed,
          creditsReserved: p.creditsReserved,
          creditsTotal: p.creditsTotal,
          expiresAt: p.expiresAt,
          purchasedAt: p.purchasedAt,
        },
      })
    }
    return errorResponse("INVALID_INPUT", { message: "Datos inválidos" })
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.in_store.granted",
      passId: result.pass.id,
      userId,
      orgId,
      paymentMethod,
      price: result.pass.purchasePrice,
      grantedByStaffId: staff.uid,
      grantedByEmail: staff.email ?? null,
    }),
  )

  return NextResponse.json({
    ok: true,
    pass: result.pass,
    quote: result.quote,
  })
}
