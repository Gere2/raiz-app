import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    // MEDIA #2: Avoid N+1 queries - removed per-supplier invoice count, added limit
    const snap = await db.collection("orgs").doc(orgId).collection("suppliers").orderBy("name").limit(100).get();

    const suppliers = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ suppliers });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/suppliers
 * Body: { name, contact?, phone?, email?, notes? }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    // ALTA #1: Add requireOrgMember check
    await requireOrgMember(req, orgId);
    const { name, contact, phone, email, notes } = await req.json();

    if (!name) return NextResponse.json({ error: "name obligatorio" }, { status: 400 });

    const ref = db.collection("orgs").doc(orgId).collection("suppliers").doc();
    await ref.set({
      name,
      contact: contact || "",
      phone: phone || "",
      email: email || "",
      notes: notes || "",
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
