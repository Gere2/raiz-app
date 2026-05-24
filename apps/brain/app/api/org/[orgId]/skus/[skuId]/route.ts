import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; skuId: string }> };

/** Recalcula costes de un SKU a partir de receta + packaging (read-only, returns costs) */
async function calculateSkuCosts(orgId: string, skuId: string) {
  const skuRef = db.collection("orgs").doc(orgId).collection("skus").doc(skuId);
  const skuSnap = await skuRef.get();
  if (!skuSnap.exists) return null;

  const data = skuSnap.data()!;
  let recipeCost = 0;
  let packagingCost = 0;

  if (data.recipeId) {
    const rSnap = await db.collection("orgs").doc(orgId).collection("recipes").doc(data.recipeId).get();
    if (rSnap.exists) recipeCost = Number(rSnap.data()?.totalCost) || 0;
  }
  if (data.packagingId) {
    const pSnap = await db.collection("orgs").doc(orgId).collection("packaging").doc(data.packagingId).get();
    if (pSnap.exists) packagingCost = Number(pSnap.data()?.totalCost) || 0;
  }

  const totalCost = recipeCost + packagingCost;
  const price = Number(data.sellingPrice) || 0;
  const foodCostPct = price > 0 ? (totalCost / price) * 100 : 0;
  const margin = price - totalCost;

  return { recipeCost, packagingCost, totalCost, margin, foodCostPct };
}

export async function GET(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { orgId, skuId } = await params;
    await requireOrgMember(req, orgId);

    // Use transaction for read + calculate + write atomicity
    const updated = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(
        db.collection("orgs").doc(orgId).collection("skus").doc(skuId)
      );
      if (!snap.exists) return null;

      // Recalculate costs within transaction
      const costs = await calculateSkuCosts(orgId, skuId);
      if (costs) {
        transaction.update(
          db.collection("orgs").doc(orgId).collection("skus").doc(skuId),
          {
            ...costs,
            updatedAt: FieldValue.serverTimestamp(),
          }
        );
      }

      // Return updated data
      return { id: skuId, ...snap.data(), ...costs };
    });

    if (!updated) {
      return NextResponse.json({ error: "SKU no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ sku: updated });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    await requireAuth(req);
    const { orgId, skuId } = await params;
    const body = await req.json();

    const allowed = [
      "name", "category", "station", "standardTimeSec", "status",
      "posProductId", "sellingPrice", "recipeId", "packagingId",
      "allergens", "qcChecks", "substitutions",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    // Si cambia algo que afecta versión, incrementar
    const versionFields = ["recipeId", "packagingId", "allergens", "qcChecks", "substitutions"];
    const needsVersion = versionFields.some(f => updates[f] !== undefined);
    if (needsVersion) {
      updates.version = FieldValue.increment(1);
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    // Use transaction to atomically update SKU and recalculate costs
    let costs: any = null;
    await db.runTransaction(async (transaction) => {
      // Apply the updates in the transaction
      const skuRef = db.collection("orgs").doc(orgId).collection("skus").doc(skuId);
      transaction.update(skuRef, updates);

      // Calculate fresh costs based on the updated SKU
      costs = await calculateSkuCosts(orgId, skuId);
      if (costs) {
        transaction.update(skuRef, { ...costs, updatedAt: FieldValue.serverTimestamp() });
      }
    });

    return NextResponse.json({ ok: true, ...costs });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    await requireAuth(req);
    const { orgId, skuId } = await params;
    await db.collection("orgs").doc(orgId).collection("skus").doc(skuId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}
