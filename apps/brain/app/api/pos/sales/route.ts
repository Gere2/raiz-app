import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/require-auth";

/**
 * GET /api/pos/sales?days=7
 *
 * Lee tickets y orders del POS para generar métricas de ventas reales.
 * Conecta Brain con el marketplace como piloto.
 *
 * Returns: { sales[], summary }
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    // MEDIA #9: Cap days parameter to max 30
    let days = Number(req.nextUrl.searchParams.get("days")) || 7;
    days = Math.min(days, 30); // TODO: Future pagination for larger datasets
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Leer tickets (POS) y orders (App) en paralelo
    const [ticketsSnap, ordersSnap] = await Promise.all([
      db.collection("tickets")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .limit(500)
        .get(),
      db.collection("orders")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .limit(500)
        .get(),
    ]);

    // Procesar tickets del POS
    const posSales = ticketsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        source: "POS" as const,
        total: Number(data.total) || 0,
        items: (data.items || []).map((i: Record<string, unknown>) => ({
          productId: i.productId || "",
          productName: i.productName || i.name || "",
          qty: Number(i.qty) || 1,
          unitPrice: Number(i.unitPrice) || Number(i.price) || 0,
          lineTotal: (Number(i.qty) || 1) * (Number(i.unitPrice) || Number(i.price) || 0),
        })),
        paymentMethod: data.paymentMethod || "cash",
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    // Procesar orders de la App
    const appSales = ordersSnap.docs
      .filter(d => {
        const status = d.data().status;
        return status !== "CANCELED";
      })
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          source: "APP" as const,
          total: Number(data.total) || 0,
          items: (data.items || []).map((i: Record<string, unknown>) => ({
            productId: i.productId || "",
            productName: i.productName || "",
            qty: Number(i.qty) || 1,
            unitPrice: Number(i.unitPrice) || 0,
            lineTotal: (Number(i.qty) || 1) * (Number(i.unitPrice) || 0),
          })),
          paymentMethod: data.paymentProvider || "stripe",
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      });

    const allSales = [...posSales, ...appSales].sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
    );

    // Calcular resumen
    const totalRevenue = allSales.reduce((s, t) => s + t.total, 0);
    const posRevenue = posSales.reduce((s, t) => s + t.total, 0);
    const appRevenue = appSales.reduce((s, t) => s + t.total, 0);

    // Producto más vendido
    const productCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const sale of allSales) {
      for (const item of sale.items) {
        const key = item.productId || item.productName;
        if (!productCounts[key]) {
          productCounts[key] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productCounts[key].qty += item.qty;
        productCounts[key].revenue += item.lineTotal;
      }
    }
    const topProducts = Object.entries(productCounts)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Ventas por día
    const salesByDay: Record<string, { revenue: number; count: number; pos: number; app: number }> = {};
    for (const sale of allSales) {
      const day = sale.createdAt?.slice(0, 10) || "unknown";
      if (!salesByDay[day]) salesByDay[day] = { revenue: 0, count: 0, pos: 0, app: 0 };
      salesByDay[day].revenue += sale.total;
      salesByDay[day].count += 1;
      if (sale.source === "POS") salesByDay[day].pos += sale.total;
      else salesByDay[day].app += sale.total;
    }

    // Ticket medio
    const avgTicket = allSales.length > 0 ? totalRevenue / allSales.length : 0;

    return NextResponse.json({
      sales: allSales,
      summary: {
        days,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        posRevenue: Math.round(posRevenue * 100) / 100,
        appRevenue: Math.round(appRevenue * 100) / 100,
        totalTransactions: allSales.length,
        posTransactions: posSales.length,
        appTransactions: appSales.length,
        avgTicket: Math.round(avgTicket * 100) / 100,
        topProducts,
        salesByDay,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
