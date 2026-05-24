/**
 * POST /api/exam-pass/test/consume-redemption?org={orgId}
 *
 * Proxy del modo test → Brain. Mismo razonamiento de seguridad: la auorización
 * real vive en Brain (env var + ownership).
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

const DEFAULT_ORG = "raiz_y_grano"

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org") ?? DEFAULT_ORG
  return proxyToBrain(
    req,
    `/api/org/${encodeURIComponent(orgId)}/exam-pass/test/consume-redemption`,
  )
}
