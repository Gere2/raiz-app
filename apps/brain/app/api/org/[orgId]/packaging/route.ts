import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const snap = await db.collection("orgs").doc(orgId).collection("packaging").orderBy("name").get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/packaging
 * Body: {
 *   name: "Vaso 12oz + tapa + manga",
 *   items: [{ name: "Vaso papel 12oz", unitCost: 0.045, qty: 1 }, ...],
 * }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    const { name, items = [] } = await req.json();

    if (!name) return NextResponse.json({ error: "name obligatorio" }, { status: 400 });

    // BAJA #11: Round totalCost to 2 decimal places
    let totalCost = items.reduce(
      (s: number, i: { unitCost?: number; qty?: number }) =>
        s + (Number(i.unitCost) || 0) * (Number(i.qty) || 1), 0
    );
    totalCost = Math.round(totalCost * 100) / 100;

    const ref = db.collection("orgs").doc(orgId).collection("packaging").doc();
    await ref.set({
      name,
      items,
      totalCost,
      version: 1,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id, totalCost });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
