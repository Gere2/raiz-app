import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import { loadAccruals, loadAssumptions } from "@/lib/treasury/store";
import {
  aggregateMonth,
  isValidMonthId,
  type AggregatorMovement,
  type MonthlySnapshot,
} from "@/lib/treasury/monthly-aggregator";
import { deriveCashMonth } from "@/lib/treasury/classify";
import { generateCFOSummary, type CFOSummary } from "@/lib/treasury/cfo-summary";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/treasury/monthly-summary
 *
 * Genera (o devuelve cacheado) el resumen narrativo CFO/CEO de un mes.
 *
 * Body:
 *   {
 *     month: "2026-04",
 *     regenerate?: boolean,            // fuerza nueva llamada a Claude
 *     includePrevious?: boolean        // pasa snapshot del mes anterior como contexto
 *   }
 *
 * Comportamiento:
 *   - Lee/crea snapshot del mes via aggregator.
 *   - Si existe summary cacheado en treasury_monthly_snapshots/{month}.aiSummary
 *     y el scenarioHash coincide → devuelve cache.
 *   - Si no o regenerate=true → llama a Claude, guarda en cache, devuelve.
 *
 * Respuesta:
 *   { ok, fromCache, summary: CFOSummary }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const body = await req.json().catch(() => ({}));

    const month = body.month;
    if (!month || !isValidMonthId(month)) {
      return NextResponse.json(
        { error: "Falta 'month' en formato YYYY-MM." },
        { status: 400 }
      );
    }
    const regenerate = body.regenerate === true;
    const includePrevious = body.includePrevious !== false;

    /* ─── Carga snapshot del mes ──────────────────────────── */
    const [yT, mT] = month.split("-").map(Number);
    const fromDate = `${month}-01`;
    const lastDay = new Date(Date.UTC(yT, mT, 0)).getUTCDate();
    const toDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    const movsSnap = await db
      .collection("orgs").doc(orgId)
      .collection("bank_movements")
      .where("date", ">=", fromDate)
      .where("date", "<=", toDate)
      .get();
    const movements: AggregatorMovement[] = movsSnap.docs.map((d) => {
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

    const accruals = await loadAccruals(orgId, { economicMonth: month });
    const { assumptions } = await loadAssumptions(orgId, month);
    const snapshot = aggregateMonth({ monthId: month, movements, accruals, assumptions });

    /* ─── Cache lookup ────────────────────────────────────── */
    const cacheRef = db
      .collection("orgs").doc(orgId)
      .collection("treasury_monthly_snapshots")
      .doc(month);

    if (!regenerate) {
      const cached = await cacheRef.get();
      const cachedSummary = cached.exists
        ? (cached.data()?.aiSummary as CFOSummary | undefined)
        : undefined;
      if (
        cachedSummary &&
        cachedSummary.scenarioHashAtGeneration === snapshot.scenarioHash
      ) {
        return NextResponse.json({
          ok: true,
          fromCache: true,
          summary: cachedSummary,
        });
      }
    }

    /* ─── Mes anterior como contexto opcional ─────────────── */
    let previousSnapshot: MonthlySnapshot | undefined;
    if (includePrevious) {
      const prev = previousMonthId(month);
      if (prev) {
        const [pY, pM] = prev.split("-").map(Number);
        const pLast = new Date(Date.UTC(pY, pM, 0)).getUTCDate();
        const pFrom = `${prev}-01`;
        const pTo = `${prev}-${String(pLast).padStart(2, "0")}`;
        const pMovsSnap = await db
          .collection("orgs").doc(orgId)
          .collection("bank_movements")
          .where("date", ">=", pFrom)
          .where("date", "<=", pTo)
          .get();
        const pMovs: AggregatorMovement[] = pMovsSnap.docs.map((d) => {
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
        const pAccruals = await loadAccruals(orgId, { economicMonth: prev });
        const { assumptions: pAssumptions } = await loadAssumptions(orgId, prev);
        previousSnapshot = aggregateMonth({
          monthId: prev,
          movements: pMovs,
          accruals: pAccruals,
          assumptions: pAssumptions,
        });
      }
    }

    /* ─── Llamada a Claude ────────────────────────────────── */
    const summary = await generateCFOSummary(snapshot, { previousSnapshot });

    /* ─── Persiste cache ──────────────────────────────────── */
    await cacheRef.set(
      {
        monthId: month,
        aiSummary: summary,
        snapshot, // guardamos el snapshot también para auditoría
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      fromCache: false,
      summary,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury monthly-summary error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * GET /api/org/[orgId]/treasury/monthly-summary?month=2026-04
 *
 * Solo lee del cache, no llama a Claude. Si no hay cache devuelve { summary: null }.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const url = new URL(req.url);
    const month = url.searchParams.get("month");
    if (!month || !isValidMonthId(month)) {
      return NextResponse.json({ error: "Falta 'month' en formato YYYY-MM." }, { status: 400 });
    }

    const cached = await db
      .collection("orgs").doc(orgId)
      .collection("treasury_monthly_snapshots")
      .doc(month)
      .get();

    const summary = cached.exists ? (cached.data()?.aiSummary as CFOSummary | undefined) : undefined;
    return NextResponse.json({ ok: true, summary: summary ?? null });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

function previousMonthId(monthId: string): string | null {
  const m = monthId.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo === 0) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}
