import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/require-auth";
import { posCollection } from "@/lib/pos-scope";

/**
 * GET /api/pos/products?orgId=<org>
 * Lee productos + categorías del catálogo del café.
 *
 * Org-scoped: Raíz y Grano (single-tenant original) sigue en las colecciones
 * top-level `products`/`categories`; los demás cafés leen su catálogo bajo
 * `orgs/{orgId}/…` (mismo shim que product-service del POS). Solo un MIEMBRO de
 * la org puede leer (requireOrgMember) → sin fuga cross-tenant.
 *
 * Devuelve: { products, categories }
 */
export async function GET(req: Request) {
  try {
    const orgId = (new URL(req.url).searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
    }
    await requireOrgMember(req, orgId);

    const [prodSnap, catSnap] = await Promise.all([
      posCollection(orgId, "products").orderBy("name").get(),
      posCollection(orgId, "categories").get(),
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
