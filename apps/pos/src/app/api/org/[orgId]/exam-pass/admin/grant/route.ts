/**
 * POST /api/org/:orgId/exam-pass/admin/grant
 *
 * Same-origin proxy a Brain para activar un bono cobrado físicamente en
 * tienda. Brain valida que el caller sea staff (cafe_users / custom claims).
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
    `/api/org/${encodeURIComponent(orgId)}/exam-pass/admin/grant`,
  )
}
