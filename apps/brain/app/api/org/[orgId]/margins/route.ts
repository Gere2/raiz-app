import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/margins?days=30
 *
 * Dashboard de márgenes: rentabilidad detallada con tendencias,
 * desglose por categoría y alertas automáticas.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const days = Number(req.nextUrl.searchParams.get("days")) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Cargar datos en paralelo
    const [skusSnap, ticketsSnap, ordersSnap, productsSnap, categoriesSnap, recipesSnap] =
      await Promise.all([
        db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.SKUS).get(),
        db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.TICKETS).where("createdAt", ">=", since).get(),
        db.collection(COLLECTIONS.ORDERS).where("orgId", "==", orgId).where("createdAt", ">=", since).get(),
        db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.PRODUCTS).get(),
        db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.CATEGORIES).get(),
        db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.RECIPES).get(),
      ]);

    // Maps
    const skuByPosId: Record<string, Record<string, unknown>> = {};
    for (const d of skusSnap.docs) {
      const data = d.data();
      if (data.posProductId) skuByPosId[data.posProductId] = { id: d.id, ...data };
    }

    // Recipe cost by productId (fallback if no SKU)
    const recipeCostByProductId: Record<string, { totalCost: number; foodCostPct: number }> = {};
    for (const d of recipesSnap.docs) {
      const data = d.data();
      if (data.productId) {
        recipeCostByProductId[data.productId] = {
          totalCost: Number(data.totalCost) || 0,
          foodCostPct: Number(data.foodCostPct) || 0,
        };
      }
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

    // Agregar ventas por producto y por período (semanal)
    const productData: Record<string, {
      name: string; category: string; qty: number; revenue: number;
      weeklyData: Record<string, { qty: number; revenue: number }>;
    }> = {};

    const getWeekKey = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      return d.toISOString().slice(0, 10);
    };

    const processItems = (items: Record<string, unknown>[], date: Date) => {
      const weekKey = getWeekKey(date);
      for (const item of items) {
        // Schema vivo (subcolección): { product: {id,name,price,category}, quantity }.
        // Schema legacy (top-level): { productId, qty, unitPrice, productName }.
        const product = (item.product || {}) as Record<string, unknown>;
        const pid = (item.productId || product.id || "") as string;
        if (!pid) continue;
        const qty = Number(item.qty) || Number(item.quantity) || 1;
        // Suplementos de modifiers (live: item.modifiers[].priceAdjustment). El
        // total del ticket ya los incluye; se atribuyen al producto base.
        const modsTotal = Array.isArray(item.modifiers)
          ? (item.modifiers as Array<Record<string, unknown>>).reduce((s, m) => s + (Number(m?.priceAdjustment) || 0), 0)
          : 0;
        const price = (Number(item.unitPrice) || Number(item.price) || Number(product.price) || 0) + modsTotal;
        if (!productData[pid]) {
          const meta = productMeta[pid];
          productData[pid] = {
            name: meta?.name || (item.productName as string) || (product.name as string) || pid,
            category: meta?.category || "Sin categoría",
            qty: 0, revenue: 0, weeklyData: {},
          };
        }
        productData[pid].qty += qty;
        productData[pid].revenue += qty * price;
        if (!productData[pid].weeklyData[weekKey]) productData[pid].weeklyData[weekKey] = { qty: 0, revenue: 0 };
        productData[pid].weeklyData[weekKey].qty += qty;
        productData[pid].weeklyData[weekKey].revenue += qty * price;
      }
    };

    for (const d of ticketsSnap.docs) {
      const data = d.data();
      const date = data.createdAt?.toDate?.() || new Date();
      processItems(data.items || [], date);
    }
    for (const d of ordersSnap.docs) {
      const data = d.data();
      if (data.status === "CANCELED") continue;
      const date = data.createdAt?.toDate?.() || new Date();
      processItems(data.items || [], date);
    }

    // Cruzar con costes
    let totalRevenue = 0, totalCost = 0;
    const items = Object.entries(productData).map(([productId, data]) => {
      const sku = skuByPosId[productId];
      const recipeFallback = recipeCostByProductId[productId];
      const unitCost = sku ? Number((sku as Record<string, unknown>).totalCost) || 0
        : recipeFallback ? recipeFallback.totalCost : 0;
      const hasCostData = !!(sku || recipeFallback);
      const sellingPrice = sku
        ? Number((sku as Record<string, unknown>).sellingPrice) || 0
        : productMeta[productId]?.price || 0;
      const unitMargin = sellingPrice - unitCost;
      const foodCostPct = sellingPrice > 0 ? (unitCost / sellingPrice) * 100 : 0;

      totalRevenue += data.revenue;
      if (hasCostData) totalCost += unitCost * data.qty;

      return {
        productId,
        productName: data.name,
        category: data.category,
        unitsSold: data.qty,
        revenue: Math.round(data.revenue * 100) / 100,
        unitCost: Math.round(unitCost * 100) / 100,
        unitMargin: Math.round(unitMargin * 100) / 100,
        foodCostPct: Math.round(foodCostPct * 10) / 10,
        totalProfit: Math.round(unitMargin * data.qty * 100) / 100,
        hasCostData,
      };
    }).sort((a, b) => b.totalProfit - a.totalProfit);

    // Categorías
    const catBreakdown: Record<string, { items: number; revenue: number; totalCost: number; totalProfit: number }> = {};
    for (const item of items) {
      const cat = item.category;
      if (!catBreakdown[cat]) catBreakdown[cat] = { items: 0, revenue: 0, totalCost: 0, totalProfit: 0 };
      catBreakdown[cat].items++;
      catBreakdown[cat].revenue += item.revenue;
      catBreakdown[cat].totalCost += item.unitCost * item.unitsSold;
      catBreakdown[cat].totalProfit += item.totalProfit;
    }
    const categories = Object.entries(catBreakdown).map(([category, d]) => ({
      category,
      items: d.items,
      revenue: Math.round(d.revenue * 100) / 100,
      avgFoodCost: d.revenue > 0 ? Math.round((d.totalCost / d.revenue) * 1000) / 10 : 0,
      avgMargin: d.revenue > 0 ? Math.round(((d.revenue - d.totalCost) / d.revenue) * 1000) / 10 : 0,
      totalProfit: Math.round(d.totalProfit * 100) / 100,
    })).sort((a, b) => b.revenue - a.revenue);

    // Trend (weekly)
    const weekKeys = new Set<string>();
    for (const pd of Object.values(productData)) {
      for (const wk of Object.keys(pd.weeklyData)) weekKeys.add(wk);
    }
    const sortedWeeks = [...weekKeys].sort();
    const trend = sortedWeeks.map(wk => {
      let rev = 0, cost = 0;
      for (const [pid, pd] of Object.entries(productData)) {
        const wd = pd.weeklyData[wk];
        if (!wd) continue;
        rev += wd.revenue;
        const sku = skuByPosId[pid];
        const rf = recipeCostByProductId[pid];
        const uc = sku ? Number((sku as Record<string, unknown>).totalCost) || 0 : rf ? rf.totalCost : 0;
        cost += uc * wd.qty;
      }
      return {
        period: new Date(wk).toLocaleDateString("es", { day: "numeric", month: "short" }),
        revenue: Math.round(rev * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        margin: Math.round((rev - cost) * 100) / 100,
      };
    });

    // Sanitize function to strip HTML tags
    const sanitizeName = (name: string): string => {
      return name.replace(/<[^>]*>/g, "").trim();
    };

    // Alertas
    const alerts: Array<{ type: string; title: string; message: string; productId?: string }> = [];
    const highFC = items.filter(i => i.hasCostData && i.foodCostPct > 35);
    if (highFC.length > 0) {
      alerts.push({
        type: "critical",
        title: `${highFC.length} producto(s) con food cost > 35%`,
        message: highFC.slice(0, 3).map(i => `${sanitizeName(i.productName)} (${i.foodCostPct}%)`).join(", "),
      });
    }
    const noCost = items.filter(i => !i.hasCostData);
    if (noCost.length > 0) {
      alerts.push({
        type: "warning",
        title: `${noCost.length} producto(s) sin coste asignado`,
        message: `Los ingresos de estos productos (${noCost.reduce((s, i) => s + i.revenue, 0).toFixed(0)}€) no se pueden analizar.`,
      });
    }
    const grossProfit = totalRevenue - totalCost;
    const avgFoodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
    const avgMarginPct = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const withCost = items.filter(i => i.hasCostData);
    const best = withCost.length > 0 ? sanitizeName(withCost.reduce((a, b) => (a.unitMargin > b.unitMargin ? a : b)).productName) : "";
    const worst = withCost.length > 0 ? sanitizeName(withCost.reduce((a, b) => (a.foodCostPct > b.foodCostPct ? a : b)).productName) : "";

    return NextResponse.json({
      kpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        avgFoodCostPct: Math.round(avgFoodCostPct * 10) / 10,
        avgMarginPct: Math.round(avgMarginPct * 10) / 10,
        bestMarginProduct: best,
        worstMarginProduct: worst,
        productsAboveThreshold: highFC.length,
        days,
      },
      items,
      categories,
      alerts,
      trend,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
