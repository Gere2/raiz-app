import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

/**
 * Feedback del piloto Enverde — orgs/{orgId}/feedback/{id}
 *
 * POST: respuesta cerrada (allowlist de 4 opciones) + texto corto opcional
 * saneado (sin control chars, máx 240). No se piden ni guardan importes,
 * productos ni datos de clientes: es feedback sobre la herramienta.
 * GET: últimos 20 con proyección {choice, message, surface, timestamp}
 * (sin uid) para la sección "Feedback reciente" del dashboard interno
 * de activación. Ambos org-scoped con requireOrgMember.
 */

type Params = { params: Promise<{ orgId: string }> };

const CHOICES = new Set(["lo_entiendo", "me_interesa", "no_se_que_hacer", "quiero_ayuda"]);
const SURFACES = new Set(["demo", "onboarding", "hub"]);
const MESSAGE_MAX = 240;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    const user = await requireOrgMember(req, orgId);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const choice = String(body?.choice || "");
    if (!CHOICES.has(choice)) {
      return NextResponse.json({ error: "Respuesta no permitida" }, { status: 400 });
    }

    // texto corto opcional: sin control chars, espacios colapsados, acotado
    const message = String(body?.message || "")
       
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MESSAGE_MAX);

    const surface = SURFACES.has(String(body?.surface)) ? String(body?.surface) : "hub";

    const ref = await db.collection("orgs").doc(orgId).collection("feedback").add({
      choice,
      message: message || null,
      surface,
      orgId,
      uid: user.uid,
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs").doc(orgId).collection("feedback")
      .orderBy("timestamp", "desc")
      .limit(20)
      .get();

    // proyección estricta, sin uid
    const feedback = snap.docs.map((d) => {
      const e = d.data();
      return {
        choice: typeof e.choice === "string" ? e.choice : null,
        message: typeof e.message === "string" ? e.message : null,
        surface: typeof e.surface === "string" ? e.surface : null,
        timestamp: typeof e.timestamp === "string" ? e.timestamp : null,
      };
    });

    return NextResponse.json({ feedback, count: snap.size });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
