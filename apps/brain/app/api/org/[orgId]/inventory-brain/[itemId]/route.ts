import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; itemId: string }> };

/**
 * PATCH /api/org/[orgId]/inventory-brain/[itemId]
 * Actualizar configuración de stock (minStock, maxStock, avgDailyUsage).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, itemId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    const allowed = ["minStock", "maxStock", "avgDailyUsage", "currentStock"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = Number(body[key]) || 0;
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    const stockRef = db.collection("orgs").doc(orgId).collection("inventory_stock").doc(itemId);
    await stockRef.set(updates, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
