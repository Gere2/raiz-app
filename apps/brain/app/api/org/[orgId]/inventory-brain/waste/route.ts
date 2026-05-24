import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/inventory-brain/waste
 * Registrar merma (desperdicio).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    const user = await requireOrgMember(req, orgId);
    const body = await req.json();
    const { itemId, qty, reason } = body;

    if (!itemId || !qty || qty <= 0) {
      return NextResponse.json({ error: "itemId, qty required" }, { status: 400 });
    }

    const orgRef = db.collection("orgs").doc(orgId);

    // Get catalog item
    const catalogDoc = await orgRef.collection("catalog").doc(itemId).get();
    const catData = catalogDoc.data() || {};
    const itemName = catData.name || "";
    const unitCost = Number(catData.unitCost) || 0;
    const costLoss = qty * unitCost;

    // Update stock (reduce)
    const stockRef = orgRef.collection("inventory_stock").doc(itemId);
    const stockDoc = await stockRef.get();
    const currentStock = stockDoc.exists ? Number(stockDoc.data()?.currentStock) || 0 : 0;
    const newStock = Math.max(0, currentStock - qty);

    // MEDIA #7: Check if qty > currentStock and warn
    if (qty > currentStock) {
      return NextResponse.json({
        error: "Waste quantity exceeds available stock",
        warning: "Waste quantity exceeds available stock",
        availableStock: currentStock,
        requestedQty: qty
      }, { status: 400 });
    }

    // MEDIA #4: Wrap all writes in atomic batch
    const batch = db.batch();

    batch.set(stockRef, { currentStock: newStock, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const wasteRef = orgRef.collection("inventory_waste").doc();
    batch.set(wasteRef, {
      itemId,
      itemName,
      qty,
      unit: catData.baseUnit || "ud",
      reason: reason || "otro",
      costLoss,
      unitCost,
      userId: user.uid,
      userName: user.email || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    const movementRef = orgRef.collection("inventory_movements").doc();
    batch.set(movementRef, {
      itemId,
      itemName,
      type: "merma",
      qty,
      previousStock: currentStock,
      newStock,
      notes: `Merma: ${reason || "otro"}`,
      userId: user.uid,
      userName: user.email || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({ ok: true, costLoss, newStock });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
