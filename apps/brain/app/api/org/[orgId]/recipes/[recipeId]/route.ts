import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; recipeId: string }> };

/**
 * GET /api/org/[orgId]/recipes/[recipeId]
 * Devuelve receta + ingredientes + totalCost recalculado
 */
export async function GET(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { orgId, recipeId } = await params;
    await requireOrgMember(req, orgId);

    const recipeRef = db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId);
    const recipeSnap = await recipeRef.get();

    if (!recipeSnap.exists) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    // Ingredientes
    const ingSnap = await recipeRef.collection("ingredients").orderBy("name").get();
    const ingredients = ingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalCost = ingredients.reduce(
      (sum: number, i: Record<string, unknown>) => sum + (Number(i.lineCost) || 0),
      0
    );

    const recipe = { id: recipeId, ...recipeSnap.data(), totalCost, ingredients };
    return NextResponse.json({ recipe });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}

/**
 * PATCH /api/org/[orgId]/recipes/[recipeId]
 * Actualiza campos de la receta (sellingPrice, name, yieldQty, yieldUnit)
 */
export async function PATCH(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { orgId, recipeId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    // productId vincula la receta a un producto del TPV (flujo del Resumen);
    // string vacío permite desvincular.
    const allowed = ["name", "sellingPrice", "yieldQty", "yieldUnit", "productId"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (updates.productId !== undefined) {
      updates.productId = typeof updates.productId === "string"
        ? updates.productId.trim().slice(0, 120)
        : "";
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    // Si cambia el precio, recalcular foodCostPct
    if (updates.sellingPrice !== undefined) {
      const ingSnap = await db
        .collection("orgs").doc(orgId)
        .collection("recipes").doc(recipeId)
        .collection("ingredients").get();

      const totalCost = ingSnap.docs.reduce(
        (sum, d) => sum + (Number(d.data().lineCost) || 0), 0
      );

      const price = Number(updates.sellingPrice);
      updates.totalCost = totalCost;
      updates.foodCostPct = price >= 0.01 ? (totalCost / price) * 100 : 0;
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    await db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId).update(updates);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/org/[orgId]/recipes/[recipeId]
 * Borra receta y sus ingredientes
 * CRITICAL: Verifica que no hay SKUs dependientes antes de borrar
 */
export async function DELETE(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { orgId, recipeId } = await params;
    await requireOrgMember(req, orgId);

    const recipeRef = db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId);

    // CRITICAL FIX: Verificar que no hay SKUs que referencien esta receta
    const dependentSkusSnap = await db
      .collection("orgs").doc(orgId)
      .collection("skus")
      .where("recipeId", "==", recipeId)
      .get();

    if (!dependentSkusSnap.empty) {
      const skuNames = dependentSkusSnap.docs.map(d => d.data().name || d.id).join(", ");
      return NextResponse.json(
        { error: `No se puede borrar esta receta. Los siguientes SKUs la referencian: ${skuNames}` },
        { status: 409 }
      );
    }

    // Borrar ingredientes primero
    const ingSnap = await recipeRef.collection("ingredients").get();
    const batch = db.batch();
    ingSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(recipeRef);
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}
