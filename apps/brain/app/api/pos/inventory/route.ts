import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

/**
 * GET /api/pos/inventory
 * Lee inventario + categorías de inventario del POS
 * (colecciones raíz: inventory, inventory_categories)
 */
export async function GET(req: Request) {
  try {
    await requireAuth(req);

    const [invSnap, catSnap] = await Promise.all([
      db.collection("inventory").get(),
      db.collection("inventory_categories").get(),
    ]);

    const catMap: Record<string, string> = {};
    catSnap.docs.forEach((d) => {
      catMap[d.id] = d.data().name || d.id;
    });

    const items = invSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || "",
        stock: Number(data.stock) || 0,
        unit: data.unit || "",
        minStock: Number(data.minStock) || 0,
        supplier: data.supplier || "",
        categoryId: data.category || null,
        categoryName: data.category ? (catMap[data.category] || "") : "",
        batchNumber: data.batchNumber || null,
      };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
