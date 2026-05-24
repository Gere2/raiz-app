import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

/**
 * GET /api/pos/products
 * Lee productos + categorías directamente de las colecciones del POS
 * (colecciones raíz: products, categories)
 *
 * NOTE: This endpoint reads from root-level collections (not org-scoped).
 * This is intentional for the POS system, which uses a global product catalog.
 * Cross-org data leakage is prevented by org-level POS configuration checks.
 *
 * Devuelve: { products, categories }
 */
export async function GET(_req: Request) {
  try {
    await requireAuth(_req);

    const [prodSnap, catSnap] = await Promise.all([
      db.collection("products").orderBy("name").get(),
      db.collection("categories").get(),
    ]);

    // Mapa de categorías
    const catMap: Record<string, string> = {};
    catSnap.docs.forEach((d) => {
      catMap[d.id] = d.data().name || d.id;
    });

    const categories = catSnap.docs.map((d) => ({
      id: d.id,
      name: d.data().name || d.id,
    }));

    const products = prodSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || "",
        price: Number(data.price) || 0,
        categoryId: data.category || null,
        categoryName: data.category ? (catMap[data.category] || "Sin categoría") : "Sin categoría",
        origin: data.origin || null,
      };
    });

    return NextResponse.json({ products, categories });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
