import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import type { DecodedToken } from "@/lib/require-auth";

/**
 * GET /api/org/[orgId]/recipes
 * Lista recetas con sus totales
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs")
      .doc(orgId)
      .collection("recipes")
      .orderBy("name")
      .get();

    const recipes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ recipes });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/recipes
 * Crea una receta nueva
 *
 * Body: { name, yieldQty?, yieldUnit?, sellingPrice?, productId?, estimatedUnitCost? }
 * `productId` vincula la receta a un producto del TPV (flujo "vendido sin
 * escandallo" del Resumen). `estimatedUnitCost` es el "coste rápido"
 * aproximado de ese flujo: da margen PROVISIONAL (marcado como estimado)
 * hasta que los ingredientes reales pongan totalCost > 0, que siempre manda.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { uid } = await requireOrgMember(req, orgId);
    const body = await req.json();

    const { name, yieldQty = 1, yieldUnit = "taza", sellingPrice = 0 } = body;
    const productId = typeof body.productId === "string" ? body.productId.trim().slice(0, 120) : "";
    const estimatedUnitCost = Number(body.estimatedUnitCost);
    const estOk = Number.isFinite(estimatedUnitCost) && estimatedUnitCost > 0 && estimatedUnitCost <= 10000;

    if (!name) {
      return NextResponse.json({ error: "name obligatorio" }, { status: 400 });
    }

    const ref = db.collection("orgs").doc(orgId).collection("recipes").doc();

    await ref.set({
      name,
      yieldQty: Number(yieldQty),
      yieldUnit,
      sellingPrice: Number(sellingPrice),
      ...(productId ? { productId } : {}),
      ...(estOk ? { estimatedUnitCost: Math.round(estimatedUnitCost * 100) / 100 } : {}),
      totalCost: 0,
      foodCostPct: 0,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
