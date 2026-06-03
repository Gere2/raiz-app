import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/dashboard?days=30
 *
 * Dashboard del marketplace pilot: métricas reales cruzando
 * datos de Brain (costos) con datos del POS (ventas).
 *
 * Returns: KPIs, rentabilidad por producto, alertas, tendencias
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const days = Math.min(Number(req.nextUrl.searchParams.get("days")) || 30, 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Load org config for configurable thresholds
    const configSnap = await db.collection("orgs").doc(orgId).collection("settings").doc("config").get();
    const orgConfig = configSnap.exists ? configSnap.data() : {};
    const foodCostThreshold = orgConfig?.foodCostThresholds?.acceptable ?? 35;

    // Cargar todo en paralelo
    const [skusSnap, recipesSnap, catalogSnap, ticketsSnap, ordersSnap, productsSnap] =
      await Promise.all([
        db.collection("orgs").doc(orgId).collection("skus").get(),
        db.collection("orgs").doc(orgId).collection("recipes").get(),
        db.collection("orgs").doc(orgId).collection("catalog").get(),
        // tickets viven en la subcolección org-scoped (el POS migró ahí ~mar-2026;
        // la colección top-level "tickets" quedó congelada). Org-scoped por path →
        // sin necesidad de campo orgId ni índice compuesto.
        db.collection("orgs").doc(orgId).collection("tickets").where("createdAt", ">=", since).get(),
        db.collection("orders").where("orgId", "==", orgId).where("createdAt", ">=", since).get(),
        db.collection("orgs").doc(orgId).collection("products").get(),
      ]);

    // ── SKU Data ──
    const skus = skusSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    const skuByPosId: Record<string, Record<string, unknown>> = {};
    for (const sku of skus) {
      const posId = (sku as Record<string, unknown>).posProductId as string;
      if (posId) skuByPosId[posId] = sku;
    }

    // ── POS Products map ──
    const posProducts: Record<string, { name: string; price: number }> = {};
    for (const d of productsSnap.docs) {
      const data = d.data();
      posProducts[d.id] = { name: data?.name ?? "", price: Number(data?.price) ?? 0 };
    }

    // ── Ventas reales (tickets + orders) ──
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};

    const processSaleItems = (items: Record<string, unknown>[]) => {
      for (const item of items) {
        // Schema vivo (subcolección): item = { product: {id,name,price,...}, quantity }.
        // Schema legacy (top-level congelado): item = { productId, productName, qty, unitPrice }.
        const product = (item.product || {}) as Record<string, unknown>;
        const pid = (item.productId || product.id || "") as string;
        const name = (item.productName || item.name || product.name || "") as string;
        const qty = Number(item.qty) || Number(item.quantity) || 1;
        // Suplementos de modifiers (live: item.modifiers[].priceAdjustment) — el
        // total del ticket ya los incluye; se atribuyen al producto base.
        const modsTotal = Array.isArray(item.modifiers)
          ? (item.modifiers as Array<Record<string, unknown>>).reduce((s, m) => s + (Number(m?.priceAdjustment) || 0), 0)
          : 0;
        const price = (Number(item.unitPrice) || Number(item.price) || Number(product.price) || 0) + modsTotal;
        const key = pid || name;
        if (!key) continue;
        if (!productSales[key]) productSales[key] = { name, qty: 0, revenue: 0 };
        productSales[key].qty += qty;
        productSales[key].revenue += qty * price;
      }
    };

    let totalRevenue = 0;
    let totalTransactions = 0;

    for (const d of ticketsSnap.docs) {
      const data = d.data();
      totalRevenue += Number(data.total) || 0;
      totalTransactions++;
      processSaleItems(data.items || []);
    }
    for (const d of ordersSnap.docs) {
      const data = d.data();
      if (data.status === "CANCELED") continue;
      totalRevenue += Number(data.total) || 0;
      totalTransactions++;
      processSaleItems(data.items || []);
    }

    // ── Rentabilidad por producto (marketplace core) ──
    const profitability = Object.entries(productSales)
      .map(([productId, sales]) => {
        const sku = skuByPosId[productId];
        const posProduct = posProducts[productId];
        const sellingPrice = sku
          ? Number((sku as Record<string, unknown>).sellingPrice) || 0
          : posProduct?.price || 0;
        const totalCost = sku ? Number((sku as Record<string, unknown>).totalCost) || 0 : 0;
        const foodCostPct = sku ? Number((sku as Record<string, unknown>).foodCostPct) || 0 : 0;
        const margin = sellingPrice - totalCost;
        const totalProfit = margin * sales.qty;
        const hasCostData = !!sku;

        return {
          productId,
          productName: sales.name || posProduct?.name || productId,
          unitsSold: sales.qty,
          revenue: Math.round(sales.revenue * 100) / 100,
          sellingPrice,
          unitCost: Math.round(totalCost * 100) / 100,
          unitMargin: Math.round(margin * 100) / 100,
          foodCostPct: Math.round(foodCostPct * 10) / 10,
          totalProfit: Math.round(totalProfit * 100) / 100,
          hasCostData,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // ── KPIs ──
    const totalCostEstimated = profitability
      .filter(p => p.hasCostData)
      .reduce((s, p) => s + p.unitCost * p.unitsSold, 0);
    const totalRevenueWithCosts = profitability
      .filter(p => p.hasCostData)
      .reduce((s, p) => s + p.revenue, 0);
    const avgFoodCostPct =
      totalRevenueWithCosts > 0 ? (totalCostEstimated / totalRevenueWithCosts) * 100 : 0;
    const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const coverageCount = profitability.filter(p => p.hasCostData).length;
    const coveragePct =
      profitability.length > 0 ? (coverageCount / profitability.length) * 100 : 0;

    // ── Alertas ──
    const alerts: { type: string; message: string; productId?: string }[] = [];

    // Productos con food cost alto (configurable threshold)
    for (const p of profitability) {
      if (p.hasCostData && p.foodCostPct > foodCostThreshold) {
        alerts.push({
          type: "high_food_cost",
          message: `${p.productName}: food cost ${p.foodCostPct}% (objetivo <${foodCostThreshold}%)`,
          productId: p.productId,
        });
      }
    }

    // Productos vendidos sin escandallo
    const withoutCost = profitability.filter(p => !p.hasCostData && p.unitsSold >= 5);
    if (withoutCost.length > 0) {
      alerts.push({
        type: "missing_cost_data",
        message: `${withoutCost.length} productos vendidos sin escandallo (${withoutCost.map(p => p.productName).slice(0, 3).join(", ")}...)`,
      });
    }

    // Materias primas sin proveedor
    const noSupplier = catalogSnap.docs.filter(d => !d.data().supplier);
    if (noSupplier.length > 0) {
      alerts.push({
        type: "no_supplier",
        message: `${noSupplier.length} materias primas sin proveedor asignado`,
      });
    }

    return NextResponse.json({
      kpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalTransactions,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgFoodCostPct: Math.round(avgFoodCostPct * 10) / 10,
        estimatedProfit: Math.round((totalRevenue - totalCostEstimated) * 100) / 100,
        costCoverage: Math.round(coveragePct),
        skuCount: skus.length,
        recipeCount: recipesSnap.size,
        catalogItemCount: catalogSnap.size,
        days,
      },
      profitability: profitability.slice(0, 20),
      alerts,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
