import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; contactId: string }> };

const EDITABLE_FIELDS = ["name", "phone", "email", "notes"] as const;

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, contactId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    const updates: Record<string, string | FirebaseFirestore.FieldValue> = {};
    for (const field of EDITABLE_FIELDS) {
      if (typeof body[field] === "string") updates[field] = body[field].trim();
    }
    if (updates.name === "") {
      return NextResponse.json({ error: "name no puede quedar vacío" }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    const ref = db.collection("orgs").doc(orgId).collection("contacts").doc(contactId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    await ref.update(updates);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { orgId, contactId } = await params;
    await requireOrgMember(req, orgId);

    await db.collection("orgs").doc(orgId).collection("contacts").doc(contactId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
