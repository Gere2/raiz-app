/**
 * GET /api/org/:orgId/exam-pass/admin/customer-status?userId={uid}
 *
 * Same-origin proxy a Brain para consultar el estado del bono de un cliente
 * (créditos restantes, expiración, canjes de hoy). Brain valida staff.
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  // Mantén la query string completa al reenviar (Brain lee `userId`).
  const qs = req.nextUrl.searchParams.toString()
  const path = `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/customer-status${qs ? `?${qs}` : ""}`
  return proxyToBrain(req, path)
}
