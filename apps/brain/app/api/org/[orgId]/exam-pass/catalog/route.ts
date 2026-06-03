import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/require-auth";
import { getExamPassConfig } from "@/lib/exam-pass/org-config";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/exam-pass/catalog
 *
 * Catálogo + reglas del Bono per café — fuente única que reemplaza los catálogos
 * hardcodeados (mirrors) del POS y la app. Raíz → config canónica; otros cafés →
 * override de `orgs/{orgId}/settings/examPass` sobre la canónica.
 *
 * Read-only: NO toca el motor de cobro/canje (Stripe). requireOrgMember.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const config = await getExamPassConfig(orgId);
    return NextResponse.json({ config });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
