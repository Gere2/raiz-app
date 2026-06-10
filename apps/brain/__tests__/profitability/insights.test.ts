/**
 * Tests de computeProfitabilityInsights ("Lectura rápida").
 *
 * Las reglas son puras y trazables por id; aquí se fija el contrato:
 *   - sin datos → no-data; con escandallos pero sin ventas → no-sales;
 *   - missing escandallo SIEMPRE primero (prioridad del producto);
 *   - coste aproximado → "Margen provisional" (decir que es estimado);
 *   - margen positivo se narra con cautela (parcial si falta coste);
 *   - margen ≤ 0 con costes reales NO se vende como bueno;
 *   - pocos tickets → diagnóstico limitado; máximo 5 mensajes.
 */

import { describe, it, expect } from "vitest";
import {
  computeProfitabilityInsights,
  LOW_DATA_REVENUE_EUR,
  LOW_DATA_UNITS,
  type InsightInput,
} from "../../lib/profitability/insights";

const base = (over: {
  cash?: Partial<InsightInput["cash"]>;
  margin?: Partial<InsightInput["margin"]>;
}): InsightInput => ({
  cash: { present: false, semaforo: null, ...(over.cash || {}) },
  margin: {
    source: "none",
    hasRecipes: false,
    hasSales: false,
    grossMarginMonth: 0,
    topProduct: null,
    toReview: { count: 0, names: [] },
    pendingEscandallos: 0,
    estimatedCosts: { count: 0, names: [] },
    pos: null,
    ...(over.margin || {}),
  },
});

const pos = (over: Partial<NonNullable<InsightInput["margin"]["pos"]>> = {}) => ({
  revenue: 500,
  unitsSold: 200,
  missingEscandallo: { count: 0, names: [], revenue: 0 },
  ...over,
});

const ids = (input: InsightInput) => computeProfitabilityInsights(input).map((i) => i.id);

describe("sin ventas", () => {
  it("org vacía → solo 'no-data' (info) con CTA a escandallos", () => {
    const out = computeProfitabilityInsights(base({}));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("no-data");
    expect(out[0].severity).toBe("info");
    expect(out[0].cta?.action).toBe("recipes");
  });

  it("escandallos sin ventas → 'no-sales' con CTA a ventas manuales", () => {
    const out = computeProfitabilityInsights(
      base({ margin: { source: "estimate", hasRecipes: true } })
    );
    expect(out[0].id).toBe("no-sales");
    expect(out[0].cta?.action).toBe("manual-sales");
  });
});

describe("POS con missingEscandallo", () => {
  const input = base({
    margin: {
      source: "pos",
      hasRecipes: true,
      hasSales: true,
      grossMarginMonth: 120,
      topProduct: { name: "Tarta", gross: 80 },
      pos: pos({ missingEscandallo: { count: 2, names: ["Café", "Zumo"], revenue: 42 } }),
    },
  });

  it("el insight de escandallos faltantes va PRIMERO y es accionable", () => {
    const out = computeProfitabilityInsights(input);
    expect(out[0].id).toBe("missing-escandallos");
    expect(out[0].severity).toBe("action");
    expect(out[0].cta?.action).toBe("link-products");
    expect(out[0].body).toContain("42.00€");
    expect(out[0].body).toContain("no lo estimamos");
  });

  it("el margen positivo se narra como lectura parcial", () => {
    const g = computeProfitabilityInsights(input).find((i) => i.id === "gross-positive");
    expect(g).toBeDefined();
    expect(g!.severity).toBe("good");
    expect(g!.body).toContain("parcial");
  });

  it("si TODO está sin coste (topProduct null, gross 0) NO hay lectura de margen", () => {
    const allMissing = base({
      margin: {
        source: "pos", hasRecipes: false, hasSales: true,
        grossMarginMonth: 0, topProduct: null,
        pos: pos({ missingEscandallo: { count: 3, names: ["A", "B", "C"], revenue: 99 } }),
      },
    });
    const list = ids(allMissing);
    expect(list).toContain("missing-escandallos");
    expect(list).not.toContain("gross-positive");
    expect(list).not.toContain("gross-non-positive");
  });
});

describe("POS con costes estimados", () => {
  it("'Margen provisional' dice que es aproximado y lleva a completar", () => {
    const out = computeProfitabilityInsights(
      base({
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: 50, topProduct: { name: "Tarta", gross: 50 },
          estimatedCosts: { count: 1, names: ["Tarta"] },
          pos: pos(),
        },
      })
    );
    const est = out.find((i) => i.id === "estimated-costs");
    expect(est).toBeDefined();
    expect(est!.severity).toBe("warning");
    expect(est!.body).toContain("aproximado");
    expect(est!.cta?.action).toBe("recipes");
    // y la lectura del margen avisa de que es parcial
    expect(out.find((i) => i.id === "gross-positive")!.body).toContain("parcial");
  });
});

describe("POS con escandallos reales completos", () => {
  it("margen positivo → insight good SIN coletilla de parcial", () => {
    const out = computeProfitabilityInsights(
      base({
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: 300, topProduct: { name: "Tarta", gross: 200 },
          pos: pos(),
        },
      })
    );
    const g = out.find((i) => i.id === "gross-positive");
    expect(g).toBeDefined();
    expect(g!.body).not.toContain("parcial");
    expect(out.map((i) => i.id)).not.toContain("missing-escandallos");
  });

  it("margen ≤ 0 con costes reales → warning, nunca good", () => {
    const out = computeProfitabilityInsights(
      base({
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: -12, topProduct: { name: "Tarta", gross: -12 },
          pos: pos(),
        },
      })
    );
    expect(out.map((i) => i.id)).toContain("gross-non-positive");
    expect(out.map((i) => i.id)).not.toContain("gross-positive");
  });
});

describe("pocos datos", () => {
  it(`menos de ${LOW_DATA_UNITS} uds o ${LOW_DATA_REVENUE_EUR}€ → aviso de diagnóstico limitado`, () => {
    const out = computeProfitabilityInsights(
      base({
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: 7, topProduct: { name: "Tarta", gross: 7 },
          pos: pos({ revenue: 10, unitsSold: 2 }),
        },
      })
    );
    const low = out.find((i) => i.id === "low-data");
    expect(low).toBeDefined();
    expect(low!.severity).toBe("info");
  });

  it("con volumen suficiente NO aparece", () => {
    expect(
      ids(base({
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: 300, topProduct: { name: "Tarta", gross: 200 },
          pos: pos(),
        },
      }))
    ).not.toContain("low-data");
  });
});

describe("límites y extras", () => {
  it("nunca más de 5 insights (caso cargado)", () => {
    const out = computeProfitabilityInsights(
      base({
        cash: { present: true, semaforo: "rojo" },
        margin: {
          source: "pos", hasRecipes: true, hasSales: true,
          grossMarginMonth: 5, topProduct: { name: "Tarta", gross: 5 },
          toReview: { count: 2, names: ["Café", "Zumo"] },
          pendingEscandallos: 3,
          estimatedCosts: { count: 1, names: ["Tarta"] },
          pos: pos({ revenue: 20, unitsSold: 4, missingEscandallo: { count: 1, names: ["Bocadillo"], revenue: 15 } }),
        },
      })
    );
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].id).toBe("missing-escandallos");
  });

  it("semáforo rojo → 'cash-caution' aunque no haya ventas", () => {
    const out = computeProfitabilityInsights(base({ cash: { present: true, semaforo: "rojo" } }));
    expect(out.map((i) => i.id)).toContain("cash-caution");
  });

  it("ventas manuales → la lectura cita ventas manuales, no TPV", () => {
    const g = computeProfitabilityInsights(
      base({
        margin: {
          source: "manual", hasRecipes: true, hasSales: true,
          grossMarginMonth: 40, topProduct: { name: "Tarta", gross: 40 },
        },
      })
    ).find((i) => i.id === "gross-positive");
    expect(g!.body).toContain("manuales");
  });
});
