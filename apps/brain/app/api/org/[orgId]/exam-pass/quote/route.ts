/**
 * GET /api/org/:orgId/exam-pass/quote
 *
 * Devuelve el precio actual del Bono Supervivencia Exámenes para esta org y
 * cuántos bonos quedan al precio early-bird.
 *
 * Acceso: PÚBLICO (sin auth). La info devuelta no es sensible (precio +
 * stock early-bird) y queremos que aparezca en la home a visitantes anónimos
 * para empujar la conversión a registro/compra.
 *
 * Protección anti-abuso: rate-limit del middleware (`apps/brain/middleware.ts`,
 * 30 req/min por IP) ya cubre scraping.
 */
import { NextRequest, NextResponse } from "next/server"
import { getExamPassQuote } from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  if (!orgId) return errorResponse("INVALID_INPUT", { message: "orgId requerido" })

  try {
    const quote = await getExamPassQuote(orgId)
    return NextResponse.json(quote)
  } catch (err) {
    console.error("[exam-pass/quote] error:", err)
    return errorResponse("INTERNAL_ERROR")
  }
}
