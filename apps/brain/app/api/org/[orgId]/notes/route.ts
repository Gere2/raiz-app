import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { validateRequestSize } from "@/lib/request-validators";

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireOrgMember(req, orgId);

    const snap = await db
      .collection(COLLECTIONS.ORGS).doc(orgId)
      .collection(COLLECTIONS.NOTES)
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();

    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ orgId, notes });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireOrgMember(req, orgId);

    await validateRequestSize(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();

    if (!title) return NextResponse.json({ error: "title obligatorio" }, { status: 400 });

    const ref = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.NOTES).doc();

    await ref.set({
      title,
      content,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status });
  }
}
