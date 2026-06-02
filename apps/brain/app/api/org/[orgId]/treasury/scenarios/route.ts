import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db } from "@/lib/firebase-admin";
import { loadAccruals, loadAssumptions } from "@/lib/treasury/store";
import {
  aggregateMonth,
  isValidMonthId,
  type AggregatorMovement,
} from "@/lib/treasury/monthly-aggregator";
import { deriveCashMonth } from "@/lib/treasury/classify";
import {
  computePossibleSalary,
  computeSalaryScenarios,
  computeSemaforo,
  SCENARIO_SALARIES_DEFAULT,
} from "@/lib/treasury/scenarios";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/scenarios
 *
 *   ?month=2026-04                                 mes único
 *   ?month=2026-04&salaries=0,500,1000,1500,2000    escenarios custom
 *   ?month=2026-04&salaryTarget=2000               sueldo objetivo para cálculo de tickets/día extra
 *
 * Devuelve:
 *   {
 *     monthId,
 *     semaforo:        estado actual (sueldo del mes según assumptions)
 *     possibleSalary:  { sueldoMaximo, sueldoRecomendado, gap, ticketsExtraDia, ... }
 *     scenarios:       [ {salary: 0, semaforo, cashWithSalary, ... }, ... ]
 *   }
 *
 * El endpoint se basa en el snapshot del agregador, así que siempre refleja
 * los datos más recientes de Firestore (movimientos + accruals + assumptions).
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const url = new URL(req.url);

    const month = url.searchParams.get("month");
    if (!month || !isValidMonthId(month)) {
      return NextResponse.json(
        { error: "Falta 'month' en formato YYYY-MM." },
        { status: 400 }
      );
    }

    // Sueldos a evaluar
    let salaries = SCENARIO_SALARIES_DEFAULT.slice();
    const salariesParam = url.searchParams.get("salaries");
    if (salariesParam) {
      const parsed = salariesParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n >= 0);
      if (parsed.length > 0 && parsed.length <= 10) salaries = parsed;
    }

    const salaryTargetParam = url.searchParams.get("salaryTarget");
    const salaryTargetOverride = salaryTargetParam ? Number(salaryTargetParam) : undefined;

    // Carga datos del mes
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

    const snapshot = aggregateMonth({
      monthId: month,
      movements,
      accruals,
      assumptions,
    });

    const semaforo = computeSemaforo(snapshot, assumptions.foundersSalary ?? 0);
    const possibleSalary = computePossibleSalary(snapshot, assumptions, salaryTargetOverride);
    const scenarios = computeSalaryScenarios(snapshot, salaries);

    return NextResponse.json({
      ok: true,
      monthId: month,
      assumptions,
      semaforo,
      possibleSalary,
      scenarios,
      // Trazabilidad — exponemos los totales que se usaron para el cálculo
      inputs: {
        resultadoCaja: snapshot.cash.resultadoCaja,
        resultadoEconAntesSueldo: snapshot.economic.resultadoEconomicoAntesSueldoFundador,
        ventasTpv: snapshot.cash.ventasTpv.total,
        gastosOperativosCaja: snapshot.cash.gastosOperativosTotales,
        impuestosCaja: snapshot.cash.impuestosAEAT.total + snapshot.cash.seguridadSocial.total,
        accrualsAplicados: snapshot.economic.accrualsAplicados.total,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury scenarios error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
