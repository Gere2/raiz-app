import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; taskId: string }> }
) {
  try {
    await requireAuth(req);
    const { orgId, taskId } = await params;
    await requireOrgMember(req, orgId);

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.done === "boolean") patch.done = body.done;

    await db.collection("orgs").doc(orgId).collection("tasks").doc(taskId).set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ orgId: string; taskId: string }> }
) {
  try {
    await requireAuth(req);
    const { orgId, taskId } = await params;
    await requireOrgMember(req, orgId);

    await db.collection("orgs").doc(orgId).collection("tasks").doc(taskId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
