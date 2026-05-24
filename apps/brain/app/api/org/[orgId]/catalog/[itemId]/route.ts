import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; itemId: string }> };

/**
 * GET /api/org/[orgId]/catalog/[itemId]
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId, itemId } = await params;
    await requireOrgMember(req, orgId);
    const snap = await db.collection("orgs").doc(orgId).collection("catalog").doc(itemId).get();
    if (!snap.exists) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ item: { id: itemId, ...snap.data() } });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * PATCH /api/org/[orgId]/catalog/[itemId]
 * Actualiza campos de un artículo del catálogo
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, itemId } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.baseUnit !== undefined) updates.baseUnit = body.baseUnit;
    if (body.supplier !== undefined) updates.supplier = body.supplier;
    if (body.packQty !== undefined) updates.packQty = Number(body.packQty);
    if (body.packUnit !== undefined) updates.packUnit = body.packUnit;
    if (body.packCost !== undefined) updates.packCost = Number(body.packCost);

    // Recalculate unitCost if pack data changed
    if (body.packCost !== undefined || body.packQty !== undefined) {
      const snap = await db.collection("orgs").doc(orgId).collection("catalog").doc(itemId).get();
      const current = snap.data() || {};
      const packCost = Number(updates.packCost ?? current.packCost ?? 0);
      const packQty = Number(updates.packQty ?? current.packQty ?? 1);
      updates.unitCost = packQty > 0 ? packCost / packQty : 0;
    }

    updates.updatedAt = FieldValue.serverTimestamp();
    await db.collection("orgs").doc(orgId).collection("catalog").doc(itemId).update(updates);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/org/[orgId]/catalog/[itemId]
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, itemId } = await params;
    await db.collection("orgs").doc(orgId).collection("catalog").doc(itemId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
