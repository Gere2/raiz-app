import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

type Params = {
  params: Promise<{ orgId: string; recipeId: string; ingredientId: string }>;
};

async function recalcRecipe(orgId: string, recipeId: string) {
  const recipeRef = db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId);
  const [recipeSnap, ingSnap] = await Promise.all([
    recipeRef.get(),
    recipeRef.collection("ingredients").get(),
  ]);
  const totalCost = ingSnap.docs.reduce(
    (sum, d) => sum + (Number(d.data().lineCost) || 0), 0
  );
  const sellingPrice = Number(recipeSnap.data()?.sellingPrice) || 0;
  const foodCostPct = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0;
  await recipeRef.update({ totalCost, foodCostPct, updatedAt: FieldValue.serverTimestamp() });
  return { totalCost, foodCostPct };
}

/**
 * PATCH /api/org/[orgId]/recipes/[recipeId]/ingredients/[ingredientId]
 * Actualiza cantidad de un ingrediente → recalcula lineCost y totalCost
 *
 * Body: { qty }
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, recipeId, ingredientId } = await params;
    const { qty } = await req.json();

    if (qty == null || Number(qty) < 0) {
      return NextResponse.json({ error: "qty inválido" }, { status: 400 });
    }

    const ingRef = db
      .collection("orgs").doc(orgId)
      .collection("recipes").doc(recipeId)
      .collection("ingredients").doc(ingredientId);

    const ingSnap = await ingRef.get();
    if (!ingSnap.exists) {
      return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
    }

    const data = ingSnap.data()!;
    const unitCost = Number(data.unitCost) || 0;
    const newQty = Number(qty);
    const lineCost = newQty * unitCost;

    await ingRef.update({
      qty: newQty,
      lineCost,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const { totalCost, foodCostPct } = await recalcRecipe(orgId, recipeId);
    return NextResponse.json({ ok: true, lineCost, totalCost, foodCostPct });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/org/[orgId]/recipes/[recipeId]/ingredients/[ingredientId]
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, recipeId, ingredientId } = await params;

    await db
      .collection("orgs").doc(orgId)
      .collection("recipes").doc(recipeId)
      .collection("ingredients").doc(ingredientId)
      .delete();

    const { totalCost, foodCostPct } = await recalcRecipe(orgId, recipeId);
    return NextResponse.json({ ok: true, totalCost, foodCostPct });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
