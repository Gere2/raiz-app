import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; noteId: string }> }
) {
  try {
    const { orgId, noteId } = await params;
    const { uid } = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const content = typeof body?.content === "string" ? body.content : undefined;

    if (!title && content === undefined) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const ref = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.NOTES).doc(noteId);

    // opcional: verifica ownership si quieres (por ahora, solo org-member pasa rules)
    await ref.set(
      {
        ...(title ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ orgId: string; noteId: string }> }
) {
  try {
    const { orgId, noteId } = await params;
    await requireAuth(req);

    const ref = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.NOTES).doc(noteId);
    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status });
  }
}
