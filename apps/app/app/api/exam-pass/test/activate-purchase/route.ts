/**
 * POST /api/exam-pass/test/activate-purchase?org={orgId}
 *
 * Proxy del modo test → Brain. Brain devuelve 404 si su `ENABLE_EXAM_PASS_TEST_MODE`
 * no está activo, así que este proxy es seguro de exponer aunque la flag
 * de cliente esté on por error.
 */
import { NextRequest } from "next/server"
import { proxyToBrain } from "@/lib/brain-proxy"

const DEFAULT_ORG = "raiz_y_grano"

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org") ?? DEFAULT_ORG
  return proxyToBrain(
    req,
    `/api/org/${encodeURIComponent(orgId)}/exam-pass/test/activate-purchase`,
  )
}
