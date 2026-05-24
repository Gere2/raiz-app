/**
 * GET /api/org/:orgId/exam-pass/admin/list-active-passes
 *
 * Lista todos los bonos `active` de la org. Lo usa la sección "Clientes"
 * del control tower de Brain para mostrar quién tiene bono.
 *
 * Auth: requireStaff (admin / vendedor / employee).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/require-staff"
import { AuthError } from "@/lib/require-auth"
import { listActiveExamPasses } from "@/lib/exam-pass/engine"
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

  try {
    const passes = await listActiveExamPasses(orgId)
    // Devolvemos un shape compacto: solo lo que la UI necesita pintar la
    // tabla. Evitamos enviar paymentIntentId u otros campos sensibles.
    return NextResponse.json({
      passes: passes.map((p) => ({
        passId: p.id,
        userId: p.userId,
        creditsTotal: p.creditsTotal,
        creditsUsed: p.creditsUsed,
        creditsReserved: p.creditsReserved,
        creditsAvailable:
          p.creditsTotal - p.creditsUsed - p.creditsReserved,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt,
        purchasePrice: p.purchasePrice,
        lastUsedAt: p.lastUsedAt,
      })),
    })
  } catch (err) {
    console.error("[exam-pass/admin/list-active-passes] error:", err)
    return errorResponse("INTERNAL_ERROR")
  }
}
