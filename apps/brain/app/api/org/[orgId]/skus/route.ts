import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/skus
 * Lista todos los SKUs maestros con datos enriquecidos
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs").doc(orgId)
      .collection("skus")
      .orderBy("name")
      .get();

    const skus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ skus });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/skus
 * Crea un SKU maestro
 *
 * Body: {
 *   name, category?, station?, standardTimeSec?,
 *   posProductId?, sellingPrice?,
 *   recipeId?, packagingId?,
 *   allergens?, qcChecks?, substitutions?
 * }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    const body = await req.json();

    const {
      name,
      category = "",
      station = "",
      standardTimeSec = 0,
      posProductId = null,
      sellingPrice = 0,
      recipeId = null,
      packagingId = null,
      allergens = [],
      qcChecks = [],
      substitutions = [],
    } = body;

    if (!name) {
      return NextResponse.json({ error: "name obligatorio" }, { status: 400 });
    }

    // Calcular costes si hay receta/packaging vinculados
    // MEDIA #10: Validate and clamp costs to non-negative, round foodCostPct
    let recipeCost = Math.max(0, Number(body.recipeCost) || 0);
    let packagingCost = Math.max(0, Number(body.packagingCost) || 0);

    if (recipeId) {
      const rSnap = await db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId).get();
      if (rSnap.exists) recipeCost = Math.max(0, Number(rSnap.data()?.totalCost) || 0);
    }

    if (packagingId) {
      const pSnap = await db.collection("orgs").doc(orgId).collection("packaging").doc(packagingId).get();
      if (pSnap.exists) packagingCost = Math.max(0, Number(pSnap.data()?.totalCost) || 0);
    }

    const totalCost = recipeCost + packagingCost;
    const price = Number(sellingPrice) || 0;
    // Store monetary values as cents to avoid floating point errors
    const totalCostCents = Math.round(totalCost * 100);
    const priceCents = Math.round(price * 100);
    const foodCostPct = priceCents > 0 ? Math.round((totalCostCents / priceCents) * 10000) / 100 : 0;
    const margin = price - totalCost;

    const ref = db.collection("orgs").doc(orgId).collection("skus").doc();

    await ref.set({
      name,
      category,
      station,
      standardTimeSec: Number(standardTimeSec),
      version: 1,
      status: "active",
      posProductId,
      sellingPrice: price,
      recipeId,
      packagingId,
      recipeCost,
      packagingCost,
      totalCost,
      margin,
      foodCostPct,
      allergens,
      qcChecks,
      substitutions,
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
