import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import {
  computeMonthlyMargin,
  normalizeTicketItems,
  type RecipeLite,
  type ManualLine,
} from "@/lib/profitability/monthly-summary";

/**
 * GET /api/org/[orgId]/profitability-summary
 *
 * Síntesis mensual SOLO-LECTURA que combina lo ya existente, sin recalcular ni
 * llamar a Claude:
 *   - Caja/sueldo: lee el último snapshot cacheado por treasury/monthly-summary
 *     (treasury_monthly_snapshots/{month}.snapshot.possibleSalary / .semaforo).
 *   - Margen del mes: prioridad de fuente (ver lib/profitability/monthly-summary):
 *     tickets POS del mes → ventas manuales → estimación por escandallos → vacío.
 *     `margin.source` lo dice explícitamente; los campos previos se conservan
 *     (respuesta aditiva: ProfitabilityOnboarding sigue funcionando igual).
 *
 * No toca el POS ni la lógica de treasury. Solo lee.
 */
type Params = { params: Promise<{ orgId: string }> };

const currentPeriodId = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const period = currentPeriodId();
    const periodStart = new Date(`${period}-01T00:00:00.000Z`);

    const [snapsSnap, salesSnap, recipesSnap, ticketsSnap] = await Promise.all([
      db.collection("orgs").doc(orgId).collection("treasury_monthly_snapshots").get(),
      db.collection("orgs").doc(orgId).collection("manual_sales").doc(period).get(),
      db.collection("orgs").doc(orgId).collection("recipes").get(),
      db.collection("orgs").doc(orgId).collection("tickets")
        .where("createdAt", ">=", periodStart).get(),
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

    /* ── Margen del mes: POS → manual → estimación (lib/profitability) ── */
    const recipes: RecipeLite[] = recipesSnap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        name: (r.productName as string) || (r.name as string) || "Producto",
        productId: (r.productId as string) || undefined,
        sellingPrice: Number(r.sellingPrice) || 0,
        totalCost: Number(r.totalCost) || 0,
        estimatedUnitCost: Number(r.estimatedUnitCost) || 0,
      };
    });

    const manualLines: ManualLine[] = (
      (salesSnap.exists ? (salesSnap.data()?.lines as Array<Record<string, unknown>>) : []) || []
    ).map((l) => ({
      recipeId: (l.recipeId as string) || "",
      unitsSold: Number(l.unitsSold) || 0,
    }));

    const ticketItems = normalizeTicketItems(
      ticketsSnap.docs.flatMap((d) => (d.data().items as unknown[]) || [])
    );

    const margin = computeMonthlyMargin({ recipes, manualLines, ticketItems });

    return NextResponse.json({ period, cash, margin });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
