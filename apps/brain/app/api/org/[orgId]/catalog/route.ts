import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { validateRequestSize } from "@/lib/request-validators";

/**
 * GET /api/org/[orgId]/catalog
 * Lista todos los artículos del catálogo de materias primas
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection(COLLECTIONS.ORGS)
      .doc(orgId)
      .collection(COLLECTIONS.CATALOG)
      .orderBy("name")
      .get();

    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/catalog
 * Crea un artículo de catálogo
 *
 * Body: { name, baseUnit, packQty, packUnit, packCost, supplier? }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    await validateRequestSize(req);

    const body = await req.json();

    const { name, baseUnit, packQty, packUnit, packCost, supplier } = body;

    if (!name || !baseUnit || !packQty || packCost == null) {
      return NextResponse.json(
        { error: "Campos obligatorios: name, baseUnit, packQty, packCost" },
        { status: 400 }
      );
    }

    // Validate packCost and packQty are positive
    const packCostNum = Number(packCost);
    const packQtyNum = Number(packQty);
    if (packCostNum <= 0 || packQtyNum <= 0) {
      return NextResponse.json(
        { error: "packCost y packQty deben ser mayores que cero" },
        { status: 400 }
      );
    }

    const unitCost = packCostNum / packQtyNum;
    const ref = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.CATALOG).doc();

    await ref.set({
      name,
      baseUnit,
      packQty: packQtyNum,
      packUnit: packUnit || `${packQtyNum}${baseUnit}`,
      packCost: packCostNum,
      unitCost,
      supplier: supplier || "",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id, unitCost });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
