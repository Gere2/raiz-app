import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/inventory-brain/movement
 * Registrar entrada o salida de stock.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    const user = await requireOrgMember(req, orgId);
    const body = await req.json();
    const { itemId, type, qty, notes } = body;

    if (!itemId || !type || !qty || qty <= 0) {
      return NextResponse.json({ error: "itemId, type, qty required" }, { status: 400 });
    }

    const orgRef = db.collection("orgs").doc(orgId);

    // Get catalog item name and verify it exists
    const catalogDoc = await orgRef.collection("catalog").doc(itemId).get();
    if (!catalogDoc.exists) {
      return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
    }
    const itemName = catalogDoc.data()?.name || "";

    // Use transaction to ensure atomicity of read + calculate + write
    const newStock = await db.runTransaction(async (transaction) => {
      // Get or create stock doc
      const stockRef = orgRef.collection("inventory_stock").doc(itemId);
      const stockDoc = await transaction.get(stockRef);
      const currentStock = stockDoc.exists ? Number(stockDoc.data()?.currentStock) || 0 : 0;

      const delta = type === "entrada" ? qty : -qty;

      // For "salida" (output), reject if trying to output more than current stock
      if (type === "salida" && qty > currentStock) {
        throw Object.assign(new Error(`Cannot output ${qty} units. Current stock is only ${currentStock} units.`), {
          status: 400,
          currentStock,
          requestedQty: qty,
        });
      }

      const newStockValue = currentStock + delta;

      // Update stock atomically
      transaction.set(
        stockRef,
        {
          currentStock: newStockValue,
          lastRestockAt: type === "entrada" ? FieldValue.serverTimestamp() : (stockDoc.data()?.lastRestockAt || null),
          minStock: stockDoc.data()?.minStock || 0,
          maxStock: stockDoc.data()?.maxStock || 0,
          avgDailyUsage: stockDoc.data()?.avgDailyUsage || 0,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Record movement atomically
      const movementRef = orgRef.collection("inventory_movements").doc();
      transaction.set(movementRef, {
        itemId,
        itemName,
        type,
        qty,
        previousStock: currentStock,
        newStock: newStockValue,
        notes: notes || "",
        userId: user.uid,
        userName: user.email || "",
        createdAt: FieldValue.serverTimestamp(),
      });

      return newStockValue;
    });

    return NextResponse.json({ ok: true, newStock });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
