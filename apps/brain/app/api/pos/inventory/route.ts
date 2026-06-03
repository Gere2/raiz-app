import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/require-auth";
import { posCollection } from "@/lib/pos-scope";

/**
 * GET /api/pos/inventory?orgId=<org>
 * Lee inventario + categorías de inventario del café.
 *
 * Org-scoped (mismo shim que /api/pos/products): Raíz en las colecciones
 * top-level `inventory`/`inventory_categories`; los demás cafés bajo
 * `orgs/{orgId}/…`. requireOrgMember → sin fuga cross-tenant.
 */
export async function GET(req: Request) {
  try {
    const orgId = (new URL(req.url).searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
    }
    await requireOrgMember(req, orgId);

    const [invSnap, catSnap] = await Promise.all([
      posCollection(orgId, "inventory").get(),
      posCollection(orgId, "inventory_categories").get(),
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
