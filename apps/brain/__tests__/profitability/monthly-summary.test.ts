/**
 * Tests de computeMonthlyMargin con "coste rápido" (estimatedUnitCost).
 *
 * Regla dura: sin coste (ni real ni aproximado) NO se inventa margen.
 * Precedencia estructural: totalCost > 0 (ingredientes) siempre manda
 * sobre estimatedUnitCost; el estimado solo da margen PROVISIONAL y la
 * UI lo marca vía `estimatedCosts`.
 */

import { describe, it, expect } from "vitest";
import {
  computeMonthlyMargin,
  type RecipeLite,
  type TicketItemLite,
} from "../../lib/profitability/monthly-summary";

const recipe = (over: Partial<RecipeLite>): RecipeLite => ({
  id: "r1",
  name: "Tarta",
  sellingPrice: 5,
  totalCost: 0,
  ...over,
});

const ticket = (over: Partial<TicketItemLite>): TicketItemLite => ({
  productId: "p1",
  productName: "Tarta",
  quantity: 2,
  unitPrice: 5,
  ...over,
});

describe("POS: producto sin escandallo o sin coste", () => {
  it("sin escandallo: ingresos contados, margen NO inventado, va a missing", () => {
    const out = computeMonthlyMargin({
      recipes: [],
      manualLines: [],
      ticketItems: [ticket({})],
    });
    expect(out.source).toBe("pos");
    expect(out.grossMarginMonth).toBe(0);
    expect(out.pos?.revenue).toBe(10);
    expect(out.pos?.missingEscandallo.count).toBe(1);
    expect(out.pos?.missingEscandallo.products[0].linkedRecipeId).toBeNull();
    expect(out.estimatedCosts.count).toBe(0);
  });

  it("escandallo vinculado con coste 0 (sin estimado): sigue en missing con linkedRecipeId", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ productId: "p1", totalCost: 0 })],
      manualLines: [],
      ticketItems: [ticket({})],
    });
    expect(out.grossMarginMonth).toBe(0);
    expect(out.pos?.missingEscandallo.count).toBe(1);
    expect(out.pos?.missingEscandallo.products[0].linkedRecipeId).toBe("r1");
    expect(out.estimatedCosts.count).toBe(0);
  });
});

describe("POS: coste rápido (estimatedUnitCost)", () => {
  it("coste aprox. > 0 genera margen provisional marcado como estimado y sale de missing", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ productId: "p1", totalCost: 0, estimatedUnitCost: 1.5 })],
      manualLines: [],
      ticketItems: [ticket({})],
    });
    // 2 uds × (5 − 1.5)
    expect(out.grossMarginMonth).toBe(7);
    expect(out.pos?.missingEscandallo.count).toBe(0);
    expect(out.estimatedCosts.count).toBe(1);
    expect(out.estimatedCosts.names).toContain("Tarta");
  });

  it("ingredientes reales mandan: totalCost > 0 ignora el estimado y NO marca estimated", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ productId: "p1", totalCost: 2, estimatedUnitCost: 1.5 })],
      manualLines: [],
      ticketItems: [ticket({})],
    });
    // 2 uds × (5 − 2) → usa totalCost, no el estimado
    expect(out.grossMarginMonth).toBe(6);
    expect(out.estimatedCosts.count).toBe(0);
    expect(out.pos?.missingEscandallo.count).toBe(0);
  });

  it("mezcla: solo los productos con coste estimado se marcan", () => {
    const out = computeMonthlyMargin({
      recipes: [
        recipe({ id: "r1", name: "Tarta", productId: "p1", totalCost: 2 }),
        recipe({ id: "r2", name: "Café", productId: "p2", sellingPrice: 2, totalCost: 0, estimatedUnitCost: 0.5 }),
      ],
      manualLines: [],
      ticketItems: [ticket({}), ticket({ productId: "p2", productName: "Café", quantity: 4, unitPrice: 2 })],
    });
    // Tarta real: 2×(5−2)=6 · Café estimado: 4×(2−0.5)=6
    expect(out.grossMarginMonth).toBe(12);
    expect(out.estimatedCosts.count).toBe(1);
    expect(out.estimatedCosts.names).toEqual(["Café"]);
  });
});

describe("Manual: misma precedencia", () => {
  it("receta con coste estimado da margen provisional marcado", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ totalCost: 0, estimatedUnitCost: 1 })],
      manualLines: [{ recipeId: "r1", unitsSold: 10 }],
      ticketItems: [],
    });
    expect(out.source).toBe("manual");
    // 10 × (5 − 1)
    expect(out.grossMarginMonth).toBe(40);
    expect(out.estimatedCosts.count).toBe(1);
  });

  it("receta sin ningún coste no aporta margen", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ totalCost: 0 })],
      manualLines: [{ recipeId: "r1", unitsSold: 10 }],
      ticketItems: [],
    });
    expect(out.source).toBe("manual");
    expect(out.grossMarginMonth).toBe(0);
    expect(out.estimatedCosts.count).toBe(0);
  });

  it("totalCost real manda también en manual", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ totalCost: 2, estimatedUnitCost: 1 })],
      manualLines: [{ recipeId: "r1", unitsSold: 10 }],
      ticketItems: [],
    });
    expect(out.grossMarginMonth).toBe(30);
    expect(out.estimatedCosts.count).toBe(0);
  });
});

describe("estimate / none: sin ventas no cambia nada", () => {
  it("solo escandallos → estimate, estimatedCosts vacío", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ estimatedUnitCost: 1 })],
      manualLines: [],
      ticketItems: [],
    });
    expect(out.source).toBe("estimate");
    expect(out.hasSales).toBe(false);
    expect(out.grossMarginMonth).toBe(0);
    expect(out.estimatedCosts.count).toBe(0);
  });

  it("sin nada → none", () => {
    const out = computeMonthlyMargin({ recipes: [], manualLines: [], ticketItems: [] });
    expect(out.source).toBe("none");
    expect(out.estimatedCosts.count).toBe(0);
  });
});

describe("calidad de escandallos: el estimado NO quita el aviso de pendiente", () => {
  it("receta con solo coste estimado sigue contando como pendingEscandallo", () => {
    const out = computeMonthlyMargin({
      recipes: [recipe({ productId: "p1", totalCost: 0, estimatedUnitCost: 1.5 })],
      manualLines: [],
      ticketItems: [ticket({})],
    });
    expect(out.pendingEscandallos).toBe(1);
  });
});
