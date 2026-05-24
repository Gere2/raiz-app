/**
 * GET /api/org/:orgId/exam-pass/quote
 *
 * Proxy a Brain para mostrar el precio actual del bono en el modal POS.
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  return proxyToBrain(
    req,
    `/api/org/${encodeURIComponent(orgId)}/exam-pass/quote`,
  )
}
