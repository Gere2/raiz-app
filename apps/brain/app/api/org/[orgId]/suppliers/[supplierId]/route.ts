import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; supplierId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId, supplierId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db.collection("orgs").doc(orgId).collection("suppliers").doc(supplierId).get();
    if (!snap.exists) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });

    // Facturas
    const invSnap = await snap.ref.collection("invoices").orderBy("date", "desc").limit(50).get();
    const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Artículos del catálogo de este proveedor
    const supplierName = snap.data()?.name;
    const catalogItems = supplierName
      ? (await db.collection("orgs").doc(orgId).collection("catalog")
          .where("supplier", "==", supplierName).get())
          .docs.map(d => ({ id: d.id, ...d.data() }))
      : [];

    return NextResponse.json({
      supplier: { id: supplierId, ...snap.data() },
      invoices,
      catalogItems,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, supplierId } = await params;
    const body = await req.json();

    const allowed = ["name", "contact", "phone", "email", "notes"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    updates.updatedAt = FieldValue.serverTimestamp();
    await db.collection("orgs").doc(orgId).collection("suppliers").doc(supplierId).update(updates);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, supplierId } = await params;

    // Borrar facturas del proveedor
    const invSnap = await db.collection("orgs").doc(orgId)
      .collection("suppliers").doc(supplierId)
      .collection("invoices").get();

    const batch = db.batch();
    invSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection("orgs").doc(orgId).collection("suppliers").doc(supplierId));
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
