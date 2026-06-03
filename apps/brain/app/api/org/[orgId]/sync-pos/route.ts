import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import { posCollection } from "@/lib/pos-scope";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/sync-pos
 *
 * Sincroniza precios del POS → SKUs y Recetas vinculados
 * Para cada producto POS:
 *   1. Si tiene SKU vinculado → actualiza sellingPrice + recalcula costes
 *   2. Si tiene receta vinculada (legacy) → actualiza sellingPrice + recalcula foodCostPct
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    // 1. Leer productos POS del café (Raíz→top-level; otros→org-scoped)
    const posSnap = await posCollection(orgId, "products").get();
    const posProducts = new Map<string, { name: string; price: number }>();
    posSnap.docs.forEach(d => {
      posProducts.set(d.id, { name: d.data().name, price: Number(d.data().price) || 0 });
    });

    let skusUpdated = 0;
    let recipesUpdated = 0;
    const changes: Array<{ name: string; type: string; oldPrice: number; newPrice: number }> = [];

    // 2. Sincronizar SKUs
    const skuSnap = await db.collection("orgs").doc(orgId).collection("skus").get();
    for (const skuDoc of skuSnap.docs) {
      const sku = skuDoc.data();
      if (!sku.posProductId) continue;

      const pos = posProducts.get(sku.posProductId);
      if (!pos) continue;

      const oldPrice = Number(sku.sellingPrice) || 0;
      const newPrice = pos.price;

      if (Math.abs(oldPrice - newPrice) > 0.001) {
        // Precio cambió → actualizar SKU
        let recipeCost = Number(sku.recipeCost) || 0;
        let packagingCost = Number(sku.packagingCost) || 0;

        // Re-fetch recipe cost
        if (sku.recipeId) {
          const rSnap = await db.collection("orgs").doc(orgId).collection("recipes").doc(sku.recipeId).get();
          if (rSnap.exists) recipeCost = Number(rSnap.data()?.totalCost) || 0;
        }
        if (sku.packagingId) {
          const pSnap = await db.collection("orgs").doc(orgId).collection("packaging").doc(sku.packagingId).get();
          if (pSnap.exists) packagingCost = Number(pSnap.data()?.totalCost) || 0;
        }

        const totalCost = recipeCost + packagingCost;
        const foodCostPct = newPrice > 0 ? (totalCost / newPrice) * 100 : 0;
        const margin = newPrice - totalCost;

        await skuDoc.ref.update({
          sellingPrice: newPrice,
          recipeCost,
          packagingCost,
          totalCost,
          margin,
          foodCostPct,
          updatedAt: FieldValue.serverTimestamp(),
        });

        changes.push({ name: sku.name, type: "sku", oldPrice, newPrice });
        skusUpdated++;
      }
    }

    // 3. Sincronizar Recetas (legacy - para las que tengan productId directo)
    const recipeSnap = await db.collection("orgs").doc(orgId).collection("recipes").get();
    for (const recipeDoc of recipeSnap.docs) {
      const recipe = recipeDoc.data();
      if (!recipe.productId) continue;

      const pos = posProducts.get(recipe.productId);
      if (!pos) continue;

      const oldPrice = Number(recipe.sellingPrice) || 0;
      const newPrice = pos.price;

      if (Math.abs(oldPrice - newPrice) > 0.001) {
        const totalCost = Number(recipe.totalCost) || 0;
        const foodCostPct = newPrice > 0 ? (totalCost / newPrice) * 100 : 0;

        await recipeDoc.ref.update({
          sellingPrice: newPrice,
          foodCostPct,
          updatedAt: FieldValue.serverTimestamp(),
        });

        changes.push({ name: recipe.name, type: "recipe", oldPrice, newPrice });
        recipesUpdated++;
      }
    }

    return NextResponse.json({
      ok: true,
      posProducts: posProducts.size,
      skusUpdated,
      recipesUpdated,
      changes,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
