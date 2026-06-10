/**
 * Tests de computePilotReadinessChecklist ("Puesta a punto del diagnóstico").
 *
 * Contrato: 6 pasos siempre presentes (nada se oculta ni bloquea), estados
 * completado/atencion/pendiente derivados SOLO de datos existentes del
 * payload de profitability-summary, y `ready` = ventas + vinculación
 * completas + foto de caja presente (aunque sea vieja).
 */

import { describe, it, expect } from "vitest";
import { computePilotReadinessChecklist } from "../../lib/profitability/readiness";
import type { InsightInput } from "../../lib/profitability/insights";

const base = (over: {
  cash?: Partial<InsightInput["cash"]>;
  margin?: Partial<InsightInput["margin"]>;
  period?: string;
}): InsightInput => ({
  cash: { present: false, semaforo: null, month: null, ...(over.cash || {}) },
  period: over.period ?? "2026-06",
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

const byId = (input: InsightInput) => {
  const r = computePilotReadinessChecklist(input);
  return { r, step: Object.fromEntries(r.steps.map((s) => [s.id, s])) };
};

describe("org vacía", () => {
  it("6 pasos, todo pendiente, nada oculto, ready=false", () => {
    const { r, step } = byId(base({}));
    expect(r.total).toBe(6);
    expect(r.steps).toHaveLength(6);
    expect(r.completed).toBe(0);
    expect(r.ready).toBe(false);
    for (const s of r.steps) expect(s.state).toBe("pendiente");
    expect(step.sales.cta?.action).toBe("manual-sales");
    expect(step.cash.cta?.action).toBe("treasury");
    expect(step["real-recipes"].cta?.action).toBe("recipes");
    // los pasos con prerequisito explican, no bloquean
    expect(step.link.desc).toContain("ventas");
  });
});

describe("ventas", () => {
  it("POS → completado citando el TPV", () => {
    const { step } = byId(base({ margin: { source: "pos", hasSales: true, pos: pos() } }));
    expect(step.sales.state).toBe("completado");
    expect(step.sales.desc).toContain("TPV");
  });

  it("manual → completado y vinculación completada (van por escandallo)", () => {
    const { step } = byId(base({
      margin: { source: "manual", hasSales: true, hasRecipes: true, topProduct: { name: "Tarta", gross: 10 } },
    }));
    expect(step.sales.state).toBe("completado");
    expect(step.link.state).toBe("completado");
    expect(step.link.desc).toContain("manuales");
  });
});

describe("vinculación y coste aproximado", () => {
  it("POS con missing → link pendiente con CTA al Resumen; quick-cost lo ofrece", () => {
    const { r, step } = byId(base({
      margin: {
        source: "pos", hasSales: true, hasRecipes: true,
        topProduct: { name: "Tarta", gross: 10 },
        pos: pos({ missingEscandallo: { count: 2, names: ["Café", "Zumo"], revenue: 42 } }),
      },
    }));
    expect(step.link.state).toBe("pendiente");
    expect(step.link.desc).toContain("42.00€");
    expect(step.link.cta?.action).toBe("summary");
    expect(step["quick-cost"].state).toBe("pendiente");
    expect(step["quick-cost"].cta?.action).toBe("summary");
    expect(r.ready).toBe(false);
  });

  it("POS sin missing y con coste → link completado; sin estimados quick-cost dice que no hace falta", () => {
    const { step } = byId(base({
      margin: {
        source: "pos", hasSales: true, hasRecipes: true,
        topProduct: { name: "Tarta", gross: 10 }, pos: pos(),
      },
    }));
    expect(step.link.state).toBe("completado");
    expect(step["quick-cost"].state).toBe("completado");
    expect(step["quick-cost"].desc).toContain("No lo necesitas");
  });
});

describe("escandallos reales", () => {
  it("costes estimados → atención con nombres y CTA a Escandallos", () => {
    const { step } = byId(base({
      margin: {
        source: "pos", hasSales: true, hasRecipes: true,
        topProduct: { name: "Tarta", gross: 10 },
        estimatedCosts: { count: 1, names: ["Tarta"] }, pos: pos(),
      },
    }));
    expect(step["real-recipes"].state).toBe("atencion");
    expect(step["real-recipes"].desc).toContain("Tarta");
    expect(step["real-recipes"].cta?.action).toBe("recipes");
    // y quick-cost cuenta como hecho (ya se usó el atajo)
    expect(step["quick-cost"].state).toBe("completado");
  });

  it("escandallos con coste real y ninguno pendiente → completado", () => {
    const { step } = byId(base({
      margin: {
        source: "pos", hasSales: true, hasRecipes: true,
        topProduct: { name: "Tarta", gross: 10 }, pos: pos(),
      },
    }));
    expect(step["real-recipes"].state).toBe("completado");
  });
});

describe("foto de caja", () => {
  it("sin snapshot → pendiente con CTA a treasury", () => {
    const { step } = byId(base({}));
    expect(step.cash.state).toBe("pendiente");
    expect(step.cash.cta?.action).toBe("treasury");
  });

  it("snapshot del mes actual → completado nombrando el mes", () => {
    const { step } = byId(base({ cash: { present: true, month: "2026-06" }, period: "2026-06" }));
    expect(step.cash.state).toBe("completado");
    expect(step.cash.desc).toContain("junio de 2026");
  });

  it("snapshot viejo → atención con el mes y CTA de actualizar", () => {
    const { step } = byId(base({ cash: { present: true, month: "2026-04" }, period: "2026-06" }));
    expect(step.cash.state).toBe("atencion");
    expect(step.cash.desc).toContain("abril de 2026");
    expect(step.cash.desc).toContain("desactualizada");
    expect(step.cash.cta?.action).toBe("treasury");
  });
});

describe("ready y revisión", () => {
  const complete = (cashMonth: string) => base({
    cash: { present: true, month: cashMonth },
    period: "2026-06",
    margin: {
      source: "pos", hasSales: true, hasRecipes: true,
      grossMarginMonth: 100, topProduct: { name: "Tarta", gross: 100 }, pos: pos(),
    },
  });

  it("ventas + vinculación + caja al día → ready, todo completado, review con CTA", () => {
    const { r, step } = byId(complete("2026-06"));
    expect(r.ready).toBe(true);
    expect(r.completed).toBe(6);
    expect(step.review.state).toBe("completado");
    expect(step.review.cta?.action).toBe("summary");
  });

  it("caja vieja NO rompe ready (el paso ya avisa con atención)", () => {
    const { r, step } = byId(complete("2026-05"));
    expect(r.ready).toBe(true);
    expect(step.cash.state).toBe("atencion");
  });

  it("ventas sin ningún coste → review en atención (la lectura aún dice poco)", () => {
    const { step } = byId(base({
      margin: {
        source: "pos", hasSales: true, topProduct: null,
        pos: pos({ missingEscandallo: { count: 3, names: ["A", "B", "C"], revenue: 99 } }),
      },
    }));
    expect(step.review.state).toBe("atencion");
  });
});
