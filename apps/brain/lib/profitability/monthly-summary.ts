/**
 * lib/profitability/monthly-summary.ts
 *
 * Agregación PURA del "margen del mes" para profitability-summary.
 * Prioridad de fuente (decisión del producto, 2026-06-11):
 *   1. tickets POS reales del mes   → source "pos"
 *   2. ventas manuales              → source "manual"
 *   3. solo escandallos (sin ventas)→ source "estimate"
 *   4. nada                        → source "none"
 *
 * Regla dura: si un producto vendido no tiene escandallo con coste real,
 * sus ingresos/unidades se cuentan pero NO se inventa margen — va a
 * `pos.missingEscandallo` para que la UI lo pida explícitamente.
 *
 * Sin Firestore aquí: recibe datos planos (testeable sin emulador).
 */

export type SalesSource = "pos" | "manual" | "estimate" | "none";

export interface RecipeLite {
  id: string;
  name: string;
  productId?: string;
  sellingPrice: number;
  totalCost: number;
}

export interface TicketItemLite {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ManualLine {
  recipeId: string;
  unitsSold: number;
}

export interface MonthlyMargin {
  source: SalesSource;
  hasRecipes: boolean;
  hasSales: boolean;
  grossMarginMonth: number;
  topProduct: { name: string; gross: number } | null;
  toReview: { count: number; names: string[] };
  pendingEscandallos: number;
  pos: null | {
    revenue: number;
    unitsSold: number;
    missingEscandallo: {
      count: number;
      names: string[];
      revenue: number;
      /**
       * Detalle accionable (cap 20, por revenue desc) para el flujo de
       * vinculación TPV↔escandallo. `linkedRecipeId` ≠ null significa que YA
       * hay escandallo vinculado pero sin coste real (falta completarlo);
       * null = ningún escandallo apunta a este productId.
       */
      products: Array<{
        productId: string;
        name: string;
        unitsSold: number;
        revenue: number;
        linkedRecipeId: string | null;
      }>;
    };
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Normaliza items de ticket a TicketItemLite. Mismos dos esquemas que soporta
 * /api/org/[orgId]/margins (mantener en sintonía):
 *   vivo  (subcolección): { product: {id,name,price}, quantity, modifiers? }
 *   legacy (top-level):   { productId, productName, qty, unitPrice }
 * Los suplementos de modifiers se atribuyen al precio del producto base.
 */
export function normalizeTicketItems(rawItems: unknown[]): TicketItemLite[] {
  const out: TicketItemLite[] = [];
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const product = (item.product || {}) as Record<string, unknown>;
    const productId = ((item.productId || product.id || "") as string).trim();
    if (!productId) continue;
    const quantity = Number(item.qty) || Number(item.quantity) || 1;
    const modsTotal = Array.isArray(item.modifiers)
      ? (item.modifiers as Array<Record<string, unknown>>).reduce(
          (s, m) => s + (Number(m?.priceAdjustment) || 0), 0)
      : 0;
    const unitPrice =
      (Number(item.unitPrice) || Number(item.price) || Number(product.price) || 0) + modsTotal;
    const productName =
      ((item.productName || product.name || "") as string) || productId;
    out.push({ productId, productName, quantity, unitPrice });
  }
  return out;
}

export function computeMonthlyMargin(input: {
  recipes: RecipeLite[];
  manualLines: ManualLine[];
  ticketItems: TicketItemLite[];
}): MonthlyMargin {
  const { recipes, manualLines, ticketItems } = input;

  /* ── Indicadores de calidad de escandallos (independientes de la fuente) ── */
  const toReviewNames: string[] = [];
  let pendingEscandallos = 0;
  const recipeById: Record<string, RecipeLite> = {};
  const recipeByProductId: Record<string, RecipeLite> = {};
  for (const r of recipes) {
    recipeById[r.id] = r;
    if (r.productId) recipeByProductId[r.productId] = r;
    if (r.totalCost <= 0) { pendingEscandallos++; continue; }
    if (r.sellingPrice <= 0) continue;
    const marginPct = ((r.sellingPrice - r.totalCost) / r.sellingPrice) * 100;
    if (marginPct < 50) toReviewNames.push(r.name);
  }

  const base = {
    hasRecipes: recipes.length > 0,
    toReview: { count: toReviewNames.length, names: toReviewNames.slice(0, 3) },
    pendingEscandallos,
  };

  /* ── 1. POS: ventas reales del TPV ── */
  if (ticketItems.length > 0) {
    type Agg = { name: string; qty: number; revenue: number };
    const byProduct: Record<string, Agg> = {};
    for (const it of ticketItems) {
      const agg = (byProduct[it.productId] ??= { name: it.productName, qty: 0, revenue: 0 });
      agg.qty += it.quantity;
      agg.revenue += it.quantity * it.unitPrice;
    }

    let grossMarginMonth = 0;
    let revenue = 0;
    let unitsSold = 0;
    let topProduct: { name: string; gross: number } | null = null;
    const missingNames: string[] = [];
    let missingRevenue = 0;
    const missingProducts: Array<{
      productId: string; name: string; unitsSold: number; revenue: number;
      linkedRecipeId: string | null;
    }> = [];

    for (const [productId, agg] of Object.entries(byProduct)) {
      revenue += agg.revenue;
      unitsSold += agg.qty;
      const recipe = recipeByProductId[productId];
      if (!recipe || recipe.totalCost <= 0) {
        // Sin escandallo real: ingresos contados, margen NO inventado.
        missingNames.push(recipe?.name || agg.name);
        missingRevenue += agg.revenue;
        missingProducts.push({
          productId,
          name: recipe?.name || agg.name,
          unitsSold: agg.qty,
          revenue: round2(agg.revenue),
          linkedRecipeId: recipe ? recipe.id : null,
        });
        continue;
      }
      const gross = agg.revenue - recipe.totalCost * agg.qty;
      grossMarginMonth += gross;
      const name = recipe.name || agg.name;
      if (!topProduct || gross > topProduct.gross) topProduct = { name, gross: round2(gross) };
    }

    return {
      ...base,
      source: "pos",
      hasSales: true,
      grossMarginMonth: round2(grossMarginMonth),
      topProduct,
      pos: {
        revenue: round2(revenue),
        unitsSold,
        missingEscandallo: {
          count: missingNames.length,
          names: missingNames.slice(0, 3),
          revenue: round2(missingRevenue),
          products: missingProducts
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20),
        },
      },
    };
  }

  /* ── 2. Ventas manuales × escandallos ── */
  const unitsByRecipe: Record<string, number> = {};
  for (const l of manualLines) {
    if (l.recipeId) unitsByRecipe[l.recipeId] = Number(l.unitsSold) || 0;
  }
  const hasManualUnits = Object.values(unitsByRecipe).some((u) => u > 0);

  if (hasManualUnits) {
    let grossMarginMonth = 0;
    let topProduct: { name: string; gross: number } | null = null;
    for (const [recipeId, units] of Object.entries(unitsByRecipe)) {
      if (units <= 0) continue;
      const r = recipeById[recipeId];
      if (!r || r.totalCost <= 0 || r.sellingPrice <= 0) continue;
      const gross = (r.sellingPrice - r.totalCost) * units;
      grossMarginMonth += gross;
      if (!topProduct || gross > topProduct.gross) topProduct = { name: r.name, gross: round2(gross) };
    }
    return {
      ...base,
      source: "manual",
      hasSales: true,
      grossMarginMonth: round2(grossMarginMonth),
      topProduct,
      pos: null,
    };
  }

  /* ── 3. Solo escandallos (estimación, sin ventas) / 4. vacío ── */
  return {
    ...base,
    source: recipes.length > 0 ? "estimate" : "none",
    hasSales: false,
    grossMarginMonth: 0,
    topProduct: null,
    pos: null,
  };
}
