import { RAIZ_ORG_ID } from "@/lib/tenant";
/**
 * GET /api/exam-pass/quote?org={orgId}
 * Proxy → Brain GET /api/org/{orgId}/exam-pass/quote
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

const DEFAULT_ORG = RAIZ_ORG_ID

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org") ?? DEFAULT_ORG
  return proxyToBrain(req, `/api/org/${encodeURIComponent(orgId)}/exam-pass/quote`)
}
