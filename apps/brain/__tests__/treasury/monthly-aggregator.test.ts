/**
 * Tests del agregador mensual (PR3).
 *
 * Cubre:
 *   - Cash view: ventasTpv, costeProductoPagado, gastos por categoría.
 *   - card_pending y partner_drawing restan caja pero NO son operativos.
 *   - internal_transfer NO entra en resultado.
 *   - Resultado caja = ingresos - gastos - card - socio - impuestos - SS.
 *   - Vista económica: usa economicMonth con fallback a cashMonth.
 *   - Sueldo fundador imputado en económico.
 *   - Accruals suman al mes correspondiente.
 *   - Warnings: sin_clasificar > 3%, income_other sospechoso, mes vacío.
 *   - foodCost target/alerta/rojo según ratio.
 *   - aggregateMonths produce 1 snapshot por mes en rango.
 *   - enumerateMonths cruza año correctamente.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateMonth,
  aggregateMonths,
  enumerateMonths,
  isValidMonthId,
  type AggregatorAccrual,
  type AggregatorMovement,
} from "../../lib/treasury/monthly-aggregator";
import type { TreasuryAssumptions } from "../../lib/treasury/types";
import { DEFAULT_ASSUMPTIONS } from "../../lib/treasury/seed-accounts";

const A: TreasuryAssumptions = { ...DEFAULT_ASSUMPTIONS };

const m = (over: Partial<AggregatorMovement>): AggregatorMovement => ({
  id: over.id ?? "x",
  date: over.date ?? "2026-04-15",
  amount: over.amount ?? 0,
  concept: over.concept ?? "",
  category: over.category ?? null,
  subcategory: over.subcategory ?? null,
  flowKind: over.flowKind ?? null,
  classifierSource: over.classifierSource ?? null,
  cashMonth: over.cashMonth ?? "2026-04",
  economicMonth: over.economicMonth ?? null,
  accountId: over.accountId ?? "bbva_main",
});

describe("aggregateMonth — cash view", () => {
  it("clasifica ventas TPV positivas y costes negativos", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v1", amount: 300, flowKind: "income_sales_tpv", category: "ventas_tpv" }),
        m({ id: "v2", amount: 250, flowKind: "income_sales_tpv", category: "ventas_tpv" }),
        m({ id: "c1", amount: -100, flowKind: "expense_operating", category: "materia_prima" }),
        m({ id: "c2", amount: -50, flowKind: "expense_operating", category: "packaging" }),
      ],
    });
    expect(r.cash.ventasTpv.total).toBe(550);
    expect(r.cash.ventasTpv.count).toBe(2);
    expect(r.cash.costeProductoPagado.total).toBe(-150);
    expect(r.cash.ingresosTotales).toBe(550);
    expect(r.cash.resultadoOperativoCaja).toBe(400);
  });

  it("internal_transfer NO entra en resultado pero sí en bucket visible", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "tr-out", amount: -500, flowKind: "internal_transfer", category: "traspaso_interno" }),
      ],
    });
    expect(r.cash.traspasosInternos.total).toBe(-500);
    expect(r.cash.traspasosInternos.count).toBe(1);
    expect(r.cash.resultadoOperativoCaja).toBe(1000);
    expect(r.cash.resultadoCaja).toBe(1000);
  });

  it("card_pending sí resta caja pero NO operativo", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "card", amount: -300, flowKind: "card_pending", category: "tarjeta_pendiente" }),
      ],
    });
    expect(r.cash.tarjetaPendiente.total).toBe(-300);
    expect(r.cash.resultadoOperativoCaja).toBe(1000); // sin tocar
    expect(r.cash.resultadoCajaAntesImpuestos).toBe(700); // ya restado
  });

  it("partner_drawing sí resta caja pero NO operativo", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "soc", amount: -200, flowKind: "partner_drawing", category: "disposicion_socio" }),
      ],
    });
    expect(r.cash.disposicionSocio.total).toBe(-200);
    expect(r.cash.resultadoOperativoCaja).toBe(1000);
    expect(r.cash.resultadoCajaAntesImpuestos).toBe(800);
  });

  it("impuestos y SS restan en resultadoCaja final", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "aeat", amount: -150, flowKind: "expense_operating", category: "impuestos", subcategory: "aeat" }),
        m({ id: "ss", amount: -300, flowKind: "expense_operating", category: "personal", subcategory: "autonomo_ss" }),
      ],
    });
    expect(r.cash.impuestosAEAT.total).toBe(-150);
    expect(r.cash.seguridadSocial.total).toBe(-300);
    expect(r.cash.resultadoOperativoCaja).toBe(1000); // ni impuestos ni SS
    expect(r.cash.resultadoCaja).toBe(550); // 1000 - 150 - 300
  });

  it("filtra movimientos de otros meses", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "abr", amount: 100, flowKind: "income_sales_tpv", cashMonth: "2026-04" }),
        m({ id: "mar", amount: 999, flowKind: "income_sales_tpv", cashMonth: "2026-03" }),
      ],
    });
    expect(r.cash.ventasTpv.total).toBe(100);
    expect(r.totalMovements).toBe(1);
  });
});

describe("aggregateMonth — vista económica", () => {
  it("usa economicMonth como override cuando existe", () => {
    const r = aggregateMonth({
      monthId: "2026-01",
      assumptions: A,
      movements: [
        // Nómina enero pagada en marzo: cashMonth=2026-03, economicMonth=2026-01
        m({
          id: "nom",
          amount: -800,
          cashMonth: "2026-03",
          economicMonth: "2026-01",
          flowKind: "expense_operating",
          category: "personal",
        }),
      ],
    });
    expect(r.economic.personalDevengado.total).toBe(-800);
    expect(r.economic.movimientosReasignados.deOtroMes).toEqual(["nom"]);
    expect(r.cash.personalPagado.total).toBe(0); // no es cash de enero
  });

  it("sueldo fundador imputado de assumptions", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: { ...A, foundersSalary: 1000 },
      movements: [
        m({ id: "v", amount: 5000, flowKind: "income_sales_tpv" }),
      ],
    });
    expect(r.economic.sueldoFundadorImputado).toBe(1000);
    expect(r.economic.resultadoEconomicoAntesSueldoFundador).toBe(5000);
    expect(r.economic.resultadoEconomicoConSueldoFundador).toBe(4000);
  });

  it("accruals suman al mes correcto", () => {
    const accruals: AggregatorAccrual[] = [
      { id: "ac1", economicMonth: "2026-04", amount: -660, category: "materia_prima", subcategory: "cafe", status: "pending" },
    ];
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      accruals,
      movements: [m({ id: "v", amount: 5000, flowKind: "income_sales_tpv" })],
    });
    expect(r.economic.costeProductoConsumido.total).toBe(-660);
    expect(r.economic.accrualsAplicados.count).toBe(1);
    expect(r.economic.accrualsAplicados.total).toBe(-660);
    expect(r.cash.costeProductoPagado.total).toBe(0); // no en cash
  });
});

describe("aggregateMonth — warnings", () => {
  it("warn si sin_clasificar > 3% del volumen", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "u", amount: -200, flowKind: "needs_review", classifierSource: "default" }),
      ],
    });
    expect(r.cash.pctSinClasificar).toBeGreaterThan(0.1);
    const w = r.warnings.find((w) => w.code === "sin_clasificar_alto");
    expect(w).toBeDefined();
    expect(w?.affectedIds).toContain("u");
  });

  it("warn por income_other con hint de traspaso", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "sus", amount: 2700, concept: "Santander traspaso", flowKind: "income_other" }),
      ],
    });
    const w = r.warnings.find((w) => w.code === "income_other_sospechoso_traspaso");
    expect(w).toBeDefined();
    expect(w?.affectedIds).toContain("sus");
  });

  it("warn por mes vacío", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [],
    });
    expect(r.totalMovements).toBe(0);
    expect(r.warnings.find((w) => w.code === "mes_vacio")).toBeDefined();
  });

  it("info por card_pending en el mes", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "card", amount: -800, flowKind: "card_pending" }),
      ],
    });
    const w = r.warnings.find((w) => w.code === "card_pending_no_desglosada");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("info");
  });

  it("danger si hay movimientos pero ventas TPV = 0", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "g", amount: -100, flowKind: "expense_operating", category: "materia_prima" }),
      ],
    });
    expect(r.warnings.find((w) => w.code === "ventas_cero")?.severity).toBe("danger");
  });
});

describe("foodCost", () => {
  it("verde si food cost ≤ 30%", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "c", amount: -250, flowKind: "expense_operating", category: "materia_prima" }),
      ],
    });
    expect(r.foodCost.foodCostPagadoPct).toBe(25);
    expect(r.foodCost.estado).toBe("verde");
  });

  it("amarillo entre 30% y 40%", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "c", amount: -350, flowKind: "expense_operating", category: "materia_prima" }),
      ],
    });
    expect(r.foodCost.estado).toBe("amarillo");
  });

  it("rojo si > 40%", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [
        m({ id: "v", amount: 1000, flowKind: "income_sales_tpv" }),
        m({ id: "c", amount: -450, flowKind: "expense_operating", category: "materia_prima" }),
      ],
    });
    expect(r.foodCost.estado).toBe("rojo");
  });

  it("sin_datos si no hay ventas", () => {
    const r = aggregateMonth({
      monthId: "2026-04",
      assumptions: A,
      movements: [],
    });
    expect(r.foodCost.estado).toBe("sin_datos");
  });
});

describe("aggregateMonths + enumerateMonths", () => {
  it("enumerateMonths cruza año", () => {
    expect(enumerateMonths("2025-11", "2026-02")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });

  it("enumerateMonths mismo mes", () => {
    expect(enumerateMonths("2026-04", "2026-04")).toEqual(["2026-04"]);
  });

  it("isValidMonthId", () => {
    expect(isValidMonthId("2026-04")).toBe(true);
    expect(isValidMonthId("2026-13")).toBe(false);
    expect(isValidMonthId("2026-4")).toBe(false);
    expect(isValidMonthId("abril")).toBe(false);
  });

  it("aggregateMonths devuelve un snapshot por mes", () => {
    const movs = [
      m({ id: "e1", amount: 100, flowKind: "income_sales_tpv", cashMonth: "2026-01" }),
      m({ id: "f1", amount: 200, flowKind: "income_sales_tpv", cashMonth: "2026-02" }),
      m({ id: "m1", amount: 300, flowKind: "income_sales_tpv", cashMonth: "2026-03" }),
    ];
    const snaps = aggregateMonths("2026-01", "2026-03", movs, [], { _default: A });
    expect(snaps).toHaveLength(3);
    expect(snaps[0].cash.ventasTpv.total).toBe(100);
    expect(snaps[1].cash.ventasTpv.total).toBe(200);
    expect(snaps[2].cash.ventasTpv.total).toBe(300);
  });
});
