import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/inventory-brain
 *
 * Inventario de materias primas (Brain catalog items) con stock,
 * alertas, movimientos recientes y mermas.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const orgRef = db.collection("orgs").doc(orgId);

    const [catalogSnap, stockSnap, movementsSnap, wasteSnap] = await Promise.all([
      orgRef.collection("catalog").get(),
      orgRef.collection("inventory_stock").get(),
      orgRef.collection("inventory_movements").orderBy("createdAt", "desc").limit(20).get(),
      orgRef.collection("inventory_waste").orderBy("createdAt", "desc").limit(100).get(),
    ]);

    // Build stock map
    const stockMap: Record<string, Record<string, unknown>> = {};
    for (const d of stockSnap.docs) stockMap[d.id] = { id: d.id, ...d.data() };

    // Build items from catalog + stock
    const items = catalogSnap.docs.map(d => {
      const cat = d.data();
      const stock = stockMap[d.id] || {};
      const currentStock = Number(stock.currentStock) || 0;
      const minStock = Number(stock.minStock) || 0;
      const maxStock = Number(stock.maxStock) || 0;
      const avgDailyUsage = Number(stock.avgDailyUsage) || 0;
      const daysUntilEmpty = avgDailyUsage > 0 ? Math.round(currentStock / avgDailyUsage) : 0;

      let status: "ok" | "low" | "critical" | "overstock" = "ok";
      if (minStock > 0 && currentStock <= 0) status = "critical";
      else if (minStock > 0 && currentStock <= minStock) status = "low";
      else if (maxStock > 0 && currentStock > maxStock) status = "overstock";
      else if (minStock > 0 && currentStock <= minStock * 1.2) status = "low";

      return {
        id: d.id,
        catalogItemId: d.id,
        name: cat.name || "",
        currentStock,
        unit: cat.baseUnit || "ud",
        minStock,
        maxStock,
        lastRestockAt: (stock.lastRestockAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() || null,
        avgDailyUsage,
        daysUntilEmpty,
        status,
        supplier: cat.supplier || "",
        category: cat.category || "",
      };
    });

    // Movements
    const recentMovements = movementsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        itemId: data.itemId || "",
        itemName: data.itemName || "",
        type: data.type || "ajuste",
        qty: Number(data.qty) || 0,
        previousStock: Number(data.previousStock) || 0,
        newStock: Number(data.newStock) || 0,
        notes: data.notes || "",
        date: data.createdAt?.toDate?.()?.toISOString() || "",
        userName: data.userName || "",
      };
    });

    // Waste this month
    let totalWasteCost = 0;
    const wasteByItem: Record<string, { name: string; costLoss: number }> = {};
    for (const d of wasteSnap.docs) {
      const data = d.data();
      const cost = Number(data.costLoss) || 0;
      totalWasteCost += cost;
      const name = data.itemName || "";
      if (!wasteByItem[name]) wasteByItem[name] = { name, costLoss: 0 };
      wasteByItem[name].costLoss += cost;
    }

    const lowStockCount = items.filter(i => i.status === "low").length;
    const criticalCount = items.filter(i => i.status === "critical").length;
    const overstockCount = items.filter(i => i.status === "overstock").length;

    // Total stock value (currentStock * unitCost from catalog)
    let totalStockValue = 0;
    for (const d of catalogSnap.docs) {
      const cat = d.data();
      const stock = stockMap[d.id];
      const currentStock = Number(stock?.currentStock) || 0;
      const unitCost = Number(cat.unitCost) || 0;
      totalStockValue += currentStock * unitCost;
    }

    return NextResponse.json({
      items,
      recentMovements,
      wasteThisMonth: {
        totalCostLoss: Math.round(totalWasteCost * 100) / 100,
        totalEntries: wasteSnap.size,
        topWasteItems: Object.values(wasteByItem)
          .sort((a, b) => b.costLoss - a.costLoss)
          .slice(0, 5)
          .map(w => ({ name: w.name, costLoss: Math.round(w.costLoss * 100) / 100 })),
      },
      kpis: {
        totalItems: items.length,
        lowStockCount,
        criticalCount,
        overstockCount,
        wasteRate: 0,
        totalStockValue: Math.round(totalStockValue * 100) / 100,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}