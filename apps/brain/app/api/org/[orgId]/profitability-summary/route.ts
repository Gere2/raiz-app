import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

/**
 * GET /api/org/[orgId]/profitability-summary
 *
 * Síntesis mensual SOLO-LECTURA que combina lo ya existente, sin recalcular ni
 * llamar a Claude:
 *   - Caja/sueldo: lee el último snapshot cacheado por treasury/monthly-summary
 *     (treasury_monthly_snapshots/{month}.snapshot.possibleSalary / .semaforo).
 *   - Margen del mes: cruza orgs/{orgId}/manual_sales/{YYYY-MM} (unidades vendidas)
 *     con orgs/{orgId}/recipes (margen del escandallo = sellingPrice − totalCost).
 *
 * No toca POS, ni la lógica de treasury, ni recalcula sueldo. Solo lee.
 */
type Params = { params: Promise<{ orgId: string }> };

const round2 = (n: number) => Math.round(n * 100) / 100;
const currentPeriodId = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const period = currentPeriodId();

    const [snapsSnap, salesSnap, recipesSnap] = await Promise.all([
      db.collection("orgs").doc(orgId).collection("treasury_monthly_snapshots").get(),
      db.collection("orgs").doc(orgId).collection("manual_sales").doc(period).get(),
      db.collection("orgs").doc(orgId).collection("recipes").get(),
    ]);

    /* ── Caja/sueldo: último snapshot disponible (por monthId = doc id) ── */
    let cash: {
      present: boolean;
      month: string | null;
      sueldoRecomendado: number | null;
      sueldoMaximo: number | null;
      semaforo: string | null;
    } = { present: false, month: null, sueldoRecomendado: null, sueldoMaximo: null, semaforo: null };

    if (!snapsSnap.empty) {
      const latest = snapsSnap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      const snapshot = (latest.data?.snapshot ?? {}) as Record<string, unknown>;
      const ps = (snapshot.possibleSalary ?? null) as Record<string, unknown> | null;
      const sem = (snapshot.semaforo ?? null) as Record<string, unknown> | null;
      cash = {
        present: true,
        month: (latest.data?.monthId as string) || latest.id,
        sueldoRecomendado: ps ? Number(ps.sueldoRecomendadoPrudente) || 0 : null,
        sueldoMaximo: ps ? Number(ps.sueldoMaximo) || 0 : null,
        semaforo: sem ? (sem.estado as string) ?? null : null,
      };
    }

    /* ── Margen del mes: recipes × ventas manuales ── */
    const unitsByRecipe: Record<string, number> = {};
    const lines = (salesSnap.exists ? (salesSnap.data()?.lines as Array<Record<string, unknown>>) : []) || [];
    for (const l of lines) {
      const rid = l.recipeId as string | undefined;
      if (rid) unitsByRecipe[rid] = Number(l.unitsSold) || 0;
    }

    let grossMarginMonth = 0;
    let topProduct: { name: string; gross: number } | null = null;
    const toReview: string[] = [];
    let pendingEscandallos = 0;
    let hasSales = false;

    for (const d of recipesSnap.docs) {
      const r = d.data();
      const name = (r.productName as string) || (r.name as string) || "Producto";
      const price = Number(r.sellingPrice) || 0;
      const cost = Number(r.totalCost) || 0;
      if (cost <= 0) { pendingEscandallos++; continue; }
      if (price <= 0) continue;
      const unitMargin = price - cost;
      const marginPct = (unitMargin / price) * 100;
      if (marginPct < 50) toReview.push(name);
      const units = unitsByRecipe[d.id] || 0;
      if (units > 0) {
        hasSales = true;
        const gross = unitMargin * units;
        grossMarginMonth += gross;
        if (!topProduct || gross > topProduct.gross) topProduct = { name, gross: round2(gross) };
      }
    }

    return NextResponse.json({
      period,
      cash,
      margin: {
        hasRecipes: recipesSnap.size > 0,
        hasSales,
        grossMarginMonth: round2(grossMarginMonth),
        topProduct,
        toReview: { count: toReview.length, names: toReview.slice(0, 3) },
        pendingEscandallos,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
