/**
 * POST /api/exam-pass/cancel-pending?org={orgId}
 * Proxy → Brain POST /api/org/{orgId}/exam-pass/cancel-pending
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

const DEFAULT_ORG = "raiz_y_grano"

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org") ?? DEFAULT_ORG
  return proxyToBrain(req, `/api/org/${encodeURIComponent(orgId)}/exam-pass/cancel-pending`)
}
