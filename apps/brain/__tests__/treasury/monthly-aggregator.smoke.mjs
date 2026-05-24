/**
 * Smoke runnable de PR3 sin Vitest.
 *   ./node_modules/.bin/jiti __tests__/treasury/monthly-aggregator.smoke.mjs
 */
import {
  aggregateMonth,
  aggregateMonths,
  enumerateMonths,
  isValidMonthId,
} from "../../lib/treasury/monthly-aggregator.ts";
import { DEFAULT_ASSUMPTIONS } from "../../lib/treasury/seed-accounts.ts";

const A = { ...DEFAULT_ASSUMPTIONS };
let p = 0, f = 0;
const ok = (n, c, d) => c ? (p++, console.log("  ✓ " + n)) : (f++, console.log("  ✗ " + n + (d ? " " + JSON.stringify(d) : "")));
const M = (o) => ({
  id: o.id ?? "x", date: o.date ?? "2026-04-15", amount: o.amount ?? 0,
  concept: o.concept ?? "", category: o.category ?? null, subcategory: o.subcategory ?? null,
  flowKind: o.flowKind ?? null, classifierSource: o.classifierSource ?? null,
  cashMonth: o.cashMonth ?? "2026-04", economicMonth: o.economicMonth ?? null, accountId: o.accountId ?? "bbva_main",
});

console.log("\ncash view");
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v1", amount: 300, flowKind: "income_sales_tpv" }),
    M({ id: "v2", amount: 250, flowKind: "income_sales_tpv" }),
    M({ id: "c1", amount: -100, flowKind: "expense_operating", category: "materia_prima" }),
    M({ id: "c2", amount: -50, flowKind: "expense_operating", category: "packaging" }),
  ]});
  ok("ventasTpv 550", r.cash.ventasTpv.total === 550);
  ok("costeProductoPagado -150", r.cash.costeProductoPagado.total === -150);
  ok("resultadoOperativoCaja 400", r.cash.resultadoOperativoCaja === 400);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "tr", amount: -500, flowKind: "internal_transfer" }),
  ]});
  ok("internal_transfer NO entra en resultado", r.cash.resultadoCaja === 1000);
  ok("traspasosInternos visible aparte", r.cash.traspasosInternos.total === -500);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "card", amount: -300, flowKind: "card_pending" }),
  ]});
  ok("card_pending NO toca operativo", r.cash.resultadoOperativoCaja === 1000);
  ok("card_pending SÍ resta caja", r.cash.resultadoCajaAntesImpuestos === 700);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "soc", amount: -200, flowKind: "partner_drawing" }),
  ]});
  ok("partner_drawing NO toca operativo", r.cash.resultadoOperativoCaja === 1000);
  ok("partner_drawing SÍ resta caja", r.cash.resultadoCajaAntesImpuestos === 800);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "aeat", amount: -150, flowKind: "expense_operating", category: "impuestos", subcategory: "aeat" }),
    M({ id: "ss", amount: -300, flowKind: "expense_operating", category: "personal", subcategory: "autonomo_ss" }),
  ]});
  ok("impuestos+SS restan en resultadoCaja final", r.cash.resultadoCaja === 550);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "abr", amount: 100, flowKind: "income_sales_tpv", cashMonth: "2026-04" }),
    M({ id: "mar", amount: 999, flowKind: "income_sales_tpv", cashMonth: "2026-03" }),
  ]});
  ok("filtra otros meses", r.totalMovements === 1 && r.cash.ventasTpv.total === 100);
}

console.log("\neconomic view");
{
  const r = aggregateMonth({ monthId: "2026-01", assumptions: A, movements: [
    M({ id: "nom", amount: -800, cashMonth: "2026-03", economicMonth: "2026-01", flowKind: "expense_operating", category: "personal" }),
  ]});
  ok("economicMonth override → económico de enero", r.economic.personalDevengado.total === -800);
  ok("cash de enero NO afectado", r.cash.personalPagado.total === 0);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: { ...A, foundersSalary: 1000 }, movements: [
    M({ id: "v", amount: 5000, flowKind: "income_sales_tpv" }),
  ]});
  ok("sueldo fundador imputado 1000", r.economic.sueldoFundadorImputado === 1000);
  ok("resultado económico = 4000", r.economic.resultadoEconomicoConSueldoFundador === 4000);
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A,
    accruals: [{ id: "ac1", economicMonth: "2026-04", amount: -660, category: "materia_prima", subcategory: "cafe", status: "pending" }],
    movements: [M({ id: "v", amount: 5000, flowKind: "income_sales_tpv" })],
  });
  ok("accrual suma a económico", r.economic.costeProductoConsumido.total === -660);
  ok("accrual NO suma a cash", r.cash.costeProductoPagado.total === 0);
}

console.log("\nwarnings");
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "u", amount: -200, flowKind: "needs_review" }),
  ]});
  ok("warn sin_clasificar > 3%", !!r.warnings.find((w) => w.code === "sin_clasificar_alto"));
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "sus", amount: 2700, concept: "Santander traspaso", flowKind: "income_other" }),
  ]});
  ok("warn income_other_sospechoso_traspaso", !!r.warnings.find((w) => w.code === "income_other_sospechoso_traspaso"));
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [] });
  ok("warn mes_vacio", !!r.warnings.find((w) => w.code === "mes_vacio"));
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
    M({ id: "card", amount: -800, flowKind: "card_pending" }),
  ]});
  ok("info card_pending_no_desglosada", r.warnings.find((w) => w.code === "card_pending_no_desglosada")?.severity === "info");
}
{
  const r = aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
    M({ id: "g", amount: -100, flowKind: "expense_operating", category: "materia_prima" }),
  ]});
  ok("danger ventas_cero", r.warnings.find((w) => w.code === "ventas_cero")?.severity === "danger");
}

console.log("\nfoodCost");
ok("verde ≤ 30%", aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
  M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
  M({ id: "c", amount: -250, flowKind: "expense_operating", category: "materia_prima" }),
]}).foodCost.estado === "verde");
ok("amarillo 30-40%", aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
  M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
  M({ id: "c", amount: -350, flowKind: "expense_operating", category: "materia_prima" }),
]}).foodCost.estado === "amarillo");
ok("rojo > 40%", aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [
  M({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
  M({ id: "c", amount: -450, flowKind: "expense_operating", category: "materia_prima" }),
]}).foodCost.estado === "rojo");
ok("sin_datos sin ventas", aggregateMonth({ monthId: "2026-04", assumptions: A, movements: [] }).foodCost.estado === "sin_datos");

console.log("\nrange + enumerate");
ok("enumerateMonths cruza año", JSON.stringify(enumerateMonths("2025-11", "2026-02")) === '["2025-11","2025-12","2026-01","2026-02"]');
ok("enumerateMonths mismo mes", JSON.stringify(enumerateMonths("2026-04", "2026-04")) === '["2026-04"]');
ok("isValidMonthId 2026-04", isValidMonthId("2026-04") === true);
ok("isValidMonthId 2026-13 inválido", isValidMonthId("2026-13") === false);
ok("isValidMonthId 2026-4 inválido", isValidMonthId("2026-4") === false);
{
  const movs = [
    M({ id: "e", amount: 100, flowKind: "income_sales_tpv", cashMonth: "2026-01" }),
    M({ id: "f", amount: 200, flowKind: "income_sales_tpv", cashMonth: "2026-02" }),
    M({ id: "m", amount: 300, flowKind: "income_sales_tpv", cashMonth: "2026-03" }),
  ];
  const snaps = aggregateMonths("2026-01", "2026-03", movs, [], { _default: A });
  ok("aggregateMonths devuelve 3 snapshots con ventas correctas",
    snaps.length === 3 &&
    snaps[0].cash.ventasTpv.total === 100 &&
    snaps[1].cash.ventasTpv.total === 200 &&
    snaps[2].cash.ventasTpv.total === 300);
}

console.log(`\n${p} pass · ${f} fail`);
process.exit(f > 0 ? 1 : 0);
