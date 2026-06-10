import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

/**
 * Clientes simples (Enverde) — orgs/{orgId}/contacts
 *
 * Agenda de clientes habituales que el dueño mantiene a mano. Módulo
 * aditivo e independiente del pipeline loyalty/POS (customer_profiles):
 * aquí no hay puntos, segmentos ni UID de cliente final.
 */

type Params = { params: Promise<{ orgId: string }> };

const MAX_NAME = 120;
const MAX_CONTACT = 120;
const MAX_NOTES = 500;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs").doc(orgId).collection("contacts")
      .orderBy("name")
      .limit(500)
      .get();

    const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ contacts });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/contacts
 * Body: { name, phone?, email?, notes? }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    const { uid } = await requireOrgMember(req, orgId);
    const body = await req.json();

    const name = clip(body.name, MAX_NAME);
    if (!name) return NextResponse.json({ error: "name obligatorio" }, { status: 400 });

    const ref = db.collection("orgs").doc(orgId).collection("contacts").doc();
    await ref.set({
      name,
      phone: clip(body.phone, MAX_CONTACT),
      email: clip(body.email, MAX_CONTACT),
      notes: clip(body.notes, MAX_NOTES),
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
