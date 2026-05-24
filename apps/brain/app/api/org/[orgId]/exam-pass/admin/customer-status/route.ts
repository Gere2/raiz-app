/**
 * GET /api/org/:orgId/exam-pass/admin/customer-status?userId={uid}
 *
 * Devuelve el estado del bono de un cliente — usado por el POS antes de
 * abrir el wizard de canje. El barista ve si tiene bono activo y créditos
 * restantes, sin tener que iniciar el flujo.
 *
 * Auth: requiere staff.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/require-staff"
import { AuthError } from "@/lib/require-auth"
import { getCustomerExamPassStatus } from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    await requireStaff(req)
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

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) {
    return errorResponse("INVALID_INPUT", { message: "userId requerido en query" })
  }

  try {
    const status = await getCustomerExamPassStatus(userId, orgId)
    return NextResponse.json(status)
  } catch (err) {
    console.error("[exam-pass/admin/customer-status] error:", err)
    return errorResponse("INTERNAL_ERROR")
  }
}
