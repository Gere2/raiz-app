import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import { loadAssumptions } from "@/lib/treasury/store";
import {
  aggregateMonth,
  aggregateMonths,
  enumerateMonths,
  isValidMonthId,
  type AggregatorAccrual,
  type AggregatorMovement,
  type MonthlySnapshot,
} from "@/lib/treasury/monthly-aggregator";
import { deriveCashMonth } from "@/lib/treasury/classify";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/monthly
 *
 *   ?month=2026-04                   → snapshot único
 *   ?from=2026-01&to=2026-04         → array de snapshots
 *   &recompute=true                  → ignora cache (fuerza recálculo)
 *   &writeCache=true                 → guarda en treasury_monthly_snapshots
 *
 * Nota PR3:
 *   - El cache es opt-in. Por defecto el endpoint siempre recalcula.
 *   - PR4 introducirá accruals reales; en PR3 la colección existe pero suele
 *     estar vacía y la vista económica ≈ vista cash + sueldo fundador.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const url = new URL(req.url);

    const month = url.searchParams.get("month");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const recompute = url.searchParams.get("recompute") === "true";
    const writeCache = url.searchParams.get("writeCache") === "true";

    // Resuelve rango de meses
    let monthIds: string[];
    if (month) {
      if (!isValidMonthId(month)) {
        return NextResponse.json({ error: "month inválido. Usa YYYY-MM." }, { status: 400 });
      }
      monthIds = [month];
    } else if (from && to) {
      if (!isValidMonthId(from) || !isValidMonthId(to)) {
        return NextResponse.json({ error: "from/to inválido. Usa YYYY-MM." }, { status: 400 });
      }
      monthIds = enumerateMonths(from, to);
      if (monthIds.length === 0 || monthIds.length > 36) {
        return NextResponse.json({ error: "Rango vacío o > 36 meses." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Falta 'month' o 'from'+'to'." }, { status: 400 });
    }

    // Si no es recompute, intenta cache para todos los meses
    const cachedByMonth = new Map<string, MonthlySnapshot>();
    if (!recompute) {
      const refs = monthIds.map((mid) =>
        db.collection("orgs").doc(orgId).collection("treasury_monthly_snapshots").doc(mid)
      );
      const snaps = await db.getAll(...refs);
      for (const s of snaps) {
        if (s.exists) cachedByMonth.set(s.id, s.data() as MonthlySnapshot);
      }
    }

    const monthsToCompute = monthIds.filter((m) => !cachedByMonth.has(m));

    // Si no hay nada que computar, devolvemos cache directo
    if (monthsToCompute.length === 0 && cachedByMonth.size === monthIds.length) {
      const snapshots = monthIds.map((m) => cachedByMonth.get(m)!);
      return respond(snapshots, month, true);
    }

    // Carga movimientos del rango
    const fromMonth = monthsToCompute[0] ?? monthIds[0];
    const toMonth = monthsToCompute[monthsToCompute.length - 1] ?? monthIds[monthIds.length - 1];
    const movements = await loadMovementsInRange(orgId, fromMonth, toMonth);

    // Carga accruals del rango (PR4 los rellena; en PR3 suele venir vacío)
    const accruals = await loadAccrualsInRange(orgId, fromMonth, toMonth);

    // Carga assumptions: _default + cada override de mes
    const assumptionsByMonth: Record<string, Awaited<ReturnType<typeof loadAssumptions>>["assumptions"]> = {};
    const { assumptions: defaults } = await loadAssumptions(orgId);
    assumptionsByMonth._default = defaults;
    await Promise.all(monthsToCompute.map(async (mid) => {
      const { assumptions } = await loadAssumptions(orgId, mid);
      assumptionsByMonth[mid] = assumptions;
    }));

    // Calcula los meses no cacheados
    const computed: MonthlySnapshot[] = monthsToCompute.length === 1
      ? [aggregateMonth({
          monthId: monthsToCompute[0],
          movements,
          accruals,
          assumptions: assumptionsByMonth[monthsToCompute[0]] ?? defaults,
        })]
      : aggregateMonths(
          monthsToCompute[0],
          monthsToCompute[monthsToCompute.length - 1],
          movements,
          accruals,
          assumptionsByMonth
        );

    // Cache write opcional
    if (writeCache) {
      const batch = db.batch();
      for (const s of computed) {
        const ref = db.collection("orgs").doc(orgId).collection("treasury_monthly_snapshots").doc(s.monthId);
        batch.set(ref, { ...s, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
    }

    // Combina con cache
    const computedByMonth = new Map(computed.map((s) => [s.monthId, s]));
    const finalSnapshots = monthIds.map((m) => computedByMonth.get(m) ?? cachedByMonth.get(m)!);
    return respond(finalSnapshots, month, false);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury monthly error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/* ─── Helpers ───────────────────────────────────────────────── */

function respond(
  snapshots: MonthlySnapshot[],
  singleMonth: string | null,
  fromCache: boolean
) {
  if (singleMonth) {
    return NextResponse.json({
      ok: true,
      fromCache,
      snapshot: snapshots[0] ?? null,
    });
  }
  return NextResponse.json({
    ok: true,
    fromCache,
    snapshots,
    count: snapshots.length,
  });
}

async function loadMovementsInRange(
  orgId: string,
  fromMonthId: string,
  toMonthId: string
): Promise<AggregatorMovement[]> {
  // Carga con un colchón de 1 día por margen (zonas horarias en YYYY-MM-DD).
  const fromDate = `${fromMonthId}-01`;
  const [yT, mT] = toMonthId.split("-").map(Number);
  const lastDay = new Date(Date.UTC(yT, mT, 0)).getUTCDate();
  const toDate = `${toMonthId}-${String(lastDay).padStart(2, "0")}`;

  const snap = await db.collection("orgs").doc(orgId)
    .collection("bank_movements")
    .where("date", ">=", fromDate)
    .where("date", "<=", toDate)
    .get();

  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      date: String(x.date ?? ""),
      amount: Number(x.amount) || 0,
      concept: (x.concept as string) ?? null,
      category: (x.category as string) ?? null,
      subcategory: (x.subcategory as string) ?? null,
      flowKind: (x.flowKind as string) ?? null,
      classifierSource: (x.classifierSource as string) ?? null,
      cashMonth: (x.cashMonth as string) ?? deriveCashMonth(x.date as string),
      economicMonth: (x.economicMonth as string) ?? null,
      accountId: (x.accountId as string) ?? null,
    };
  });
}

async function loadAccrualsInRange(
  orgId: string,
  fromMonthId: string,
  toMonthId: string
): Promise<AggregatorAccrual[]> {
  // PR4 introduce treasury_accruals; en PR3 es opcional y normalmente vacío.
  const monthIds = enumerateMonths(fromMonthId, toMonthId);
  if (monthIds.length === 0) return [];
  try {
    const snap = await db.collection("orgs").doc(orgId)
      .collection("treasury_accruals")
      .where("economicMonth", "in", monthIds.slice(0, 30))
      .get();
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        economicMonth: String(x.economicMonth),
        amount: Number(x.amount) || 0,
        category: String(x.category),
        subcategory: x.subcategory as string | undefined,
        description: x.description as string | undefined,
        status: x.status as AggregatorAccrual["status"],
      };
    });
  } catch {
    // Si la colección no existe aún, devolvemos array vacío.
    return [];
  }
}
