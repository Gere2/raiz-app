import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; packId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, packId } = await params;
    const snap = await db.collection("orgs").doc(orgId).collection("packaging").doc(packId).get();
    if (!snap.exists) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ packaging: { id: packId, ...snap.data() } });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, packId } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.items !== undefined) {
      updates.items = body.items;
      updates.totalCost = body.items.reduce(
        (s: number, i: { unitCost?: number; qty?: number }) =>
          s + (Number(i.unitCost) || 0) * (Number(i.qty) || 1), 0
      );
      updates.version = FieldValue.increment(1);
    }

    updates.updatedAt = FieldValue.serverTimestamp();
    await db.collection("orgs").doc(orgId).collection("packaging").doc(packId).update(updates);

    return NextResponse.json({ ok: true, totalCost: updates.totalCost });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, packId } = await params;
    await db.collection("orgs").doc(orgId).collection("packaging").doc(packId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
