import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/profitability?days=30&category=all
 *
 * @deprecated Usar /api/org/[orgId]/dashboard o /api/org/[orgId]/margins en su lugar.
 * Este endpoint se mantiene por compatibilidad pero no tiene UI que lo consuma.
 *
 * Análisis de rentabilidad cruzando costos de Brain con ventas reales.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const days = Number(req.nextUrl.searchParams.get("days")) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Cargar datos en paralelo
    const [skusSnap, ticketsSnap, ordersSnap, productsSnap, categoriesSnap] =
      await Promise.all([
        db.collection("orgs").doc(orgId).collection("skus").get(),
        db.collection("tickets").where("orgId", "==", orgId).where("createdAt", ">=", since).get(),
        db.collection("orders").where("orgId", "==", orgId).where("createdAt", ">=", since).get(),
        db.collection("products").get(),
        db.collection("categories").get(),
      ]);

    // Maps
    const skuByPosId: Record<string, Record<string, unknown>> = {};
    for (const d of skusSnap.docs) {
      const data = d.data();
      if (data.posProductId) skuByPosId[data.posProductId] = { id: d.id, ...data };
    }

    const catMap: Record<string, string> = {};
    for (const d of categoriesSnap.docs) catMap[d.id] = d.data().name || d.id;

    const productMeta: Record<string, { name: string; price: number; category: string }> = {};
    for (const d of productsSnap.docs) {
      const data = d.data();
      productMeta[d.id] = {
        name: data.name || "",
        price: Number(data.price) || 0,
        category: catMap[data.category] || "Sin categoría",
      };
    }

    // Agregar ventas por producto + por día
    const productData: Record<string, {
      name: string;
      category: string;
      qty: number;
      revenue: number;
      dailySales: Record<string, { qty: number; revenue: number }>;
    }> = {};

    const processItems = (items: Record<string, unknown>[], date: string) => {
      for (const item of items) {
        const pid = (item.productId || "") as string;
        if (!pid) continue;
        const qty = Number(item.qty) || 1;
        const price = Number(item.unitPrice) || Number(item.price) || 0;
        if (!productData[pid]) {
          const meta = productMeta[pid];
          productData[pid] = {
            name: meta?.name || (item.productName as string) || pid,
            category: meta?.category || "Sin categoría",
            qty: 0,
            revenue: 0,
            dailySales: {},
          };
        }
        productData[pid].qty += qty;
        productData[pid].revenue += qty * price;
        if (!productData[pid].dailySales[date]) {
          productData[pid].dailySales[date] = { qty: 0, revenue: 0 };
        }
        productData[pid].dailySales[date].qty += qty;
        productData[pid].dailySales[date].revenue += qty * price;
      }
    };

    for (const d of ticketsSnap.docs) {
      const data = d.data();
      const date = data.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "unknown";
      processItems(data.items || [], date);
    }
    for (const d of ordersSnap.docs) {
      const data = d.data();
      if (data.status === "CANCELED") continue;
      const date = data.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "unknown";
      processItems(data.items || [], date);
    }

    // Cruzar con costos de Brain
    const products = Object.entries(productData).map(([productId, data]) => {
      const sku = skuByPosId[productId];
      const totalCost = sku ? Number((sku as Record<string, unknown>).totalCost) || 0 : 0;
      const recipeCost = sku ? Number((sku as Record<string, unknown>).recipeCost) || 0 : 0;
      const packagingCost = sku ? Number((sku as Record<string, unknown>).packagingCost) || 0 : 0;
      const sellingPrice = sku
        ? Number((sku as Record<string, unknown>).sellingPrice) || 0
        : productMeta[productId]?.price || 0;
      const margin = sellingPrice - totalCost;
      const foodCostPct = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0;

      // Velocidad de venta (unidades/día)
      const activeDays = Object.keys(data.dailySales).length || 1;
      const velocityPerDay = data.qty / activeDays;

      return {
        productId,
        productName: data.name,
        category: data.category,
        hasCostData: !!sku,
        skuId: sku ? (sku as Record<string, unknown>).id : null,
        // Ventas
        unitsSold: data.qty,
        revenue: Math.round(data.revenue * 100) / 100,
        velocityPerDay: Math.round(velocityPerDay * 10) / 10,
        // Costos (de Brain)
        sellingPrice,
        recipeCost: Math.round(recipeCost * 100) / 100,
        packagingCost: Math.round(packagingCost * 100) / 100,
        totalUnitCost: Math.round(totalCost * 100) / 100,
        // Rentabilidad
        unitMargin: Math.round(margin * 100) / 100,
        foodCostPct: Math.round(foodCostPct * 10) / 10,
        totalProfit: Math.round(margin * data.qty * 100) / 100,
        totalCost: Math.round(totalCost * data.qty * 100) / 100,
        // Tendencia (últimos 7 días vs anteriores)
        dailySales: data.dailySales,
      };
    }).sort((a, b) => b.totalProfit - a.totalProfit);

    // Resumen por categoría
    const byCategory: Record<string, { revenue: number; profit: number; cost: number; items: number }> = {};
    for (const p of products) {
      const cat = p.category;
      if (!byCategory[cat]) byCategory[cat] = { revenue: 0, profit: 0, cost: 0, items: 0 };
      byCategory[cat].revenue += p.revenue;
      byCategory[cat].profit += p.totalProfit;
      byCategory[cat].cost += p.totalCost;
      byCategory[cat].items += 1;
    }

    return NextResponse.json({
      products,
      byCategory: Object.entries(byCategory)
        .map(([category, data]) => ({
          category,
          ...data,
          revenue: Math.round(data.revenue * 100) / 100,
          profit: Math.round(data.profit * 100) / 100,
          avgFoodCost: data.revenue > 0
            ? Math.round((data.cost / data.revenue) * 1000) / 10
            : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      meta: { days, totalProducts: products.length, withCostData: products.filter(p => p.hasCostData).length },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
