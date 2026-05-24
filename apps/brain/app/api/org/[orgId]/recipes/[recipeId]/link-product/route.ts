import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; recipeId: string }> };

/**
 * POST /api/org/[orgId]/recipes/[recipeId]/link-product
 * Vincula una receta a un producto del POS
 *
 * Body: { productId, productName, productPrice }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, recipeId } = await params;
    const { productId, productName, productPrice } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: "productId obligatorio" }, { status: 400 });
    }

    const recipeRef = db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId);

    // Actualizar receta con vínculo al producto + sincronizar PVP
    const updates: Record<string, unknown> = {
      productId,
      productName: productName || "",
      sellingPrice: Number(productPrice) || 0,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Recalcular foodCostPct con el precio del producto
    const ingSnap = await recipeRef.collection("ingredients").get();
    const totalCost = ingSnap.docs.reduce(
      (sum, d) => sum + (Number(d.data().lineCost) || 0), 0
    );
    const price = Number(productPrice) || 0;
    updates.totalCost = totalCost;
    updates.foodCostPct = price > 0 ? (totalCost / price) * 100 : 0;

    await recipeRef.update(updates);

    return NextResponse.json({ ok: true, totalCost, foodCostPct: updates.foodCostPct });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/org/[orgId]/recipes/[recipeId]/link-product
 * Desvincula la receta del producto
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, recipeId } = await params;

    await db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId).update({
      productId: FieldValue.delete(),
      productName: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
