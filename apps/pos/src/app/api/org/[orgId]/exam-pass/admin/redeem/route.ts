/**
 * POST /api/org/:orgId/exam-pass/admin/redeem
 *
 * Same-origin proxy a Brain para canjear (consumir 1 crédito) cuando el
 * cliente paga suplementos físicamente en tienda. Brain valida staff.
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  return proxyToBrain(
    req,
    `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/redeem`,
  )
}
