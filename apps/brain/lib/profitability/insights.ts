/**
 * lib/profitability/insights.ts
 *
 * "Lectura rápida": traduce el payload de profitability-summary a 3–5
 * mensajes humanos para el dueño de la cafetería. PURA y SIN cálculo nuevo:
 * solo lee lo que el motor ya decidió (computeMonthlyMargin + snapshot de
 * caja) y lo ordena por prioridad. Cada regla es trazable por `id`.
 *
 * Reglas duras heredadas del motor (aquí solo se NARRAN, no se recalculan):
 *   - sin coste no hay margen → el insight de escandallos faltantes va PRIMERO;
 *   - coste aproximado = margen provisional → siempre se dice que es estimado;
 *   - margen positivo se explica con cautela (lectura parcial si falta coste).
 */

export type InsightSeverity = "good" | "warning" | "action" | "info";

/** Acción semántica; la UI decide el href/botón según el variant. */
export type InsightCta = {
  label: string;
  action: "link-products" | "recipes" | "manual-sales" | "treasury";
};

export type Insight = {
  /** Regla que generó el mensaje (trazabilidad/tests). */
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  cta?: InsightCta;
};

export interface InsightInput {
  cash: { present: boolean; semaforo: string | null; month?: string | null };
  /** Mes actual "YYYY-MM" (el payload lo trae como `period`); fallback: hoy. */
  period?: string;
  margin: {
    source?: "pos" | "manual" | "estimate" | "none";
    hasRecipes: boolean;
    hasSales: boolean;
    grossMarginMonth: number;
    topProduct: { name: string; gross: number } | null;
    toReview: { count: number; names: string[] };
    pendingEscandallos: number;
    estimatedCosts?: { count: number; names: string[] };
    pos?: {
      revenue: number;
      unitsSold: number;
      missingEscandallo: { count: number; names: string[]; revenue: number };
    } | null;
  };
}

/** Umbral transparente de "pocos datos" para tickets POS del mes. */
export const LOW_DATA_REVENUE_EUR = 50;
export const LOW_DATA_UNITS = 20;

const MAX_INSIGHTS = 5;

const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}€`;
const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "YYYY-MM" → "mayo de 2026"; null si el formato no es válido. */
function cashMonthLabel(month: string | null | undefined): string | null {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-");
  return `${MONTHS_ES[Number(m) - 1]} de ${y}`;
}

export function computeProfitabilityInsights(input: InsightInput): Insight[] {
  const { cash, margin } = input;
  const source = margin.source ?? (margin.hasSales ? "manual" : margin.hasRecipes ? "estimate" : "none");
  const out: Insight[] = [];

  /* ── Sin ventas este mes: un solo mensaje honesto y fuera ── */
  if (source === "none") {
    out.push({
      id: "no-data",
      severity: "info",
      title: "Todavía no hay datos de este mes",
      body: "Cuando registres ventas (del TPV o a mano) y tengas escandallos, aquí verás qué significa tu margen y qué tocar primero.",
      cta: margin.hasRecipes ? undefined : { label: "Preparar escandallos", action: "recipes" },
    });
  } else if (source === "estimate") {
    out.push({
      id: "no-sales",
      severity: "info",
      title: "Sin ventas registradas todavía",
      body: "Tus escandallos están listos. En cuanto haya ventas del TPV (o las apuntes a mano), leeremos el margen real del mes.",
      cta: { label: "Añadir ventas manuales", action: "manual-sales" },
    });
  } else {
    /* ── Hay ventas (pos o manual): diagnóstico por prioridad ── */
    const missing = source === "pos" ? margin.pos?.missingEscandallo : null;
    const est = margin.estimatedCosts;
    // topProduct ≠ null ⟺ al menos un producto vendido tiene coste (real o aprox.)
    const hasCostedSales = margin.topProduct !== null;

    // 1. PRIORITARIO: ventas sin coste asociado → margen incompleto
    if (missing && missing.count > 0) {
      out.push({
        id: "missing-escandallos",
        severity: "action",
        title: "Te faltan escandallos para leer todo el mes",
        body: `Hay ${eur(missing.revenue)} vendidos en ${missing.count} ${plural(missing.count, "producto", "productos")} sin coste asociado${missing.names.length ? ` (${missing.names.join(", ")}…)` : ""}. Vincúlalos para que el margen sea completo — ese margen no lo estimamos.`,
        cta: { label: "Vincular productos", action: "link-products" },
      });
    }

    // 2. Costes aproximados → margen provisional, decirlo siempre
    if (est && est.count > 0) {
      out.push({
        id: "estimated-costs",
        severity: "warning",
        title: "Margen provisional",
        body: `El margen de ${est.count} ${plural(est.count, "producto usa un coste aproximado", "productos usa costes aproximados")} (${est.names.join(", ")}). Sirve para orientarte; completa los ingredientes para tener el dato real.`,
        cta: { label: "Completar escandallos reales", action: "recipes" },
      });
    }

    // 3. Lectura del margen bruto, con cautela y sin inventar
    if (hasCostedSales && margin.grossMarginMonth > 0) {
      const partial = (missing && missing.count > 0) || (est && est.count > 0);
      out.push({
        id: "gross-positive",
        severity: "good",
        title: "Buen inicio de margen",
        body: `Con los costes que ya tienes, este mes generas ${eur(margin.grossMarginMonth)} de margen bruto${source === "pos" ? " sobre ventas reales del TPV" : " según tus ventas manuales"}.${partial ? " Es una lectura parcial: faltan costes por completar." : ""}`,
      });
    } else if (hasCostedSales && margin.grossMarginMonth <= 0) {
      out.push({
        id: "gross-non-positive",
        severity: "warning",
        title: "El margen no sale positivo",
        body: "Con los costes registrados, estas ventas no dejan margen bruto. Revisa precios y costes, empezando por lo que más vendes.",
        cta: { label: "Revisar escandallos", action: "recipes" },
      });
    }

    // 4. Productos con margen bajo (regla del motor: <50% sobre precio, coste real)
    if (margin.toReview.count > 0) {
      out.push({
        id: "to-review",
        severity: "action",
        title: `${margin.toReview.count} ${plural(margin.toReview.count, "producto deja", "productos dejan")} poco margen`,
        body: `${margin.toReview.names.join(", ")}: menos del 50% de margen sobre su precio. Sube el precio o baja el coste.`,
        cta: { label: "Revisar escandallos", action: "recipes" },
      });
    }

    // 5. Pocos datos → diagnóstico limitado (umbral transparente)
    if (
      source === "pos" &&
      margin.pos &&
      (margin.pos.revenue < LOW_DATA_REVENUE_EUR || margin.pos.unitsSold < LOW_DATA_UNITS)
    ) {
      out.push({
        id: "low-data",
        severity: "info",
        title: "Todavía hay pocos datos",
        body: `Este mes van ${margin.pos.unitsSold} ${plural(margin.pos.unitsSold, "unidad", "unidades")} (${eur(margin.pos.revenue)}) por el TPV. El diagnóstico se afina con más tickets.`,
      });
    }

    // 6. Escandallos sin coste que aún no se han vendido (solo si nada lo cubre ya)
    if (
      margin.pendingEscandallos > 0 &&
      !out.some((i) => i.id === "missing-escandallos" || i.id === "estimated-costs")
    ) {
      out.push({
        id: "pending-escandallos",
        severity: "info",
        title: "Escandallos sin coste",
        body: `Tienes ${margin.pendingEscandallos} ${plural(margin.pendingEscandallos, "escandallo", "escandallos")} sin ingredientes con coste. No tocan el margen de este mes hasta que se vendan, pero conviene completarlos.`,
        cta: { label: "Completar escandallos", action: "recipes" },
      });
    }
  }

  /* ── Caja en alerta: aplica con o sin ventas. Siempre dice de QUÉ MES es
     la foto de caja (el snapshot puede ser viejo y parecer actual). ── */
  if (cash.present && (cash.semaforo === "amarillo" || cash.semaforo === "rojo")) {
    const label = cashMonthLabel(cash.month);
    const period = input.period ?? new Date().toISOString().slice(0, 7);
    const stale = label !== null && cash.month !== period;
    out.push({
      id: "cash-caution",
      severity: "warning",
      title: "Cuida la caja",
      body:
        (label
          ? `Tu foto de caja de ${label} deja el semáforo en ${cash.semaforo}.`
          : `Según la última foto de caja disponible, el semáforo está en ${cash.semaforo}.`) +
        " Mantén colchón antes de cobrarte más." +
        (stale ? " Puede estar desactualizada si no has subido movimientos recientes." : ""),
    });
  }

  return out.slice(0, MAX_INSIGHTS);
}
