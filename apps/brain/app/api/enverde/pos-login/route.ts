/**
 * GET /api/enverde/pos-login?orgId=<org>&next=/pos
 *
 * Handoff de identidad brain → POS. El POS vive en otro origen, así que la sesión
 * Firebase del brain NO se traslada sola. Este endpoint acuña un custom token
 * FRESCO para el uid del café autenticado y devuelve la URL del POS que lo canjea
 * (/enverde-login). Solo un MIEMBRO de la org puede acuñar (requireOrgMember), y
 * el token se acuña para SU propio uid → no permite suplantar.
 */
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

export const runtime = "nodejs";

const POS_BASE = process.env.NEXT_PUBLIC_POS_URL || "https://pos.raizygrano.com";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = (url.searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
    }

    // 403 si el caller no es miembro de esta org (fuente de verdad: orgs/{id}/members)
    const user = await requireOrgMember(req, orgId);

    const token = await adminAuth.createCustomToken(user.uid, { enverde: true, orgId });

    const rawNext = url.searchParams.get("next") || "/pos";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pos";

    const loginUrl =
      `${POS_BASE}/enverde-login?token=${encodeURIComponent(token)}` +
      `&next=${encodeURIComponent(next)}`;

    return NextResponse.json({ ok: true, url: loginUrl });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
