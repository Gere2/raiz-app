import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { validateRequestSize } from "@/lib/request-validators";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection(COLLECTIONS.ORGS)
      .doc(orgId)
      .collection(COLLECTIONS.TASKS)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ tasks });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    await validateRequestSize(req);

    const body = await req.json().catch(() => ({}));
    const title = (body?.title ?? "").toString().trim();
    const done = Boolean(body?.done ?? false);

    if (!title) return NextResponse.json({ error: "title obligatorio" }, { status: 400 });

    const ref = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.TASKS).doc();

    await ref.set({
      title,
      done,
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
