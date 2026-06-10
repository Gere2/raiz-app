/**
 * lib/profitability/readiness.ts
 *
 * "Puesta a punto del diagnóstico": checklist de primer uso del piloto.
 * PURA y sin lógica financiera nueva: lee el MISMO payload de
 * profitability-summary que la Lectura rápida (InsightInput) y deriva el
 * estado de 6 pasos hacia un diagnóstico fiable. No bloquea nada: los pasos
 * con prerequisitos quedan "pendiente" con explicación, nunca ocultos.
 *
 * Estados: completado (el dato existe) / atencion (existe pero cojea:
 * coste aproximado, foto de caja vieja) / pendiente (falta).
 * `ready` = base suficiente para leer el mes: ventas + todo lo vendido con
 * coste + foto de caja presente (aunque sea vieja → el paso lo avisa).
 */

import { cashMonthLabel, type InsightInput } from "./insights";

export type StepState = "completado" | "pendiente" | "atencion";

/** Acción semántica; la UI resuelve el href (mismos destinos que la Lectura rápida). */
export type StepCta = {
  label: string;
  action: "manual-sales" | "summary" | "recipes" | "treasury";
};

export type ChecklistStep = {
  /** Regla que decidió el estado (trazabilidad/tests). */
  id: "sales" | "link" | "quick-cost" | "real-recipes" | "cash" | "review";
  state: StepState;
  title: string;
  desc: string;
  cta?: StepCta;
};

export type PilotReadiness = {
  steps: ChecklistStep[];
  completed: number;
  total: number;
  /** "Ya tienes una base suficiente para leer el mes." */
  ready: boolean;
};

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);
const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}€`;

export function computePilotReadinessChecklist(input: InsightInput): PilotReadiness {
  const { cash, margin } = input;
  const source = margin.source ?? (margin.hasSales ? "manual" : margin.hasRecipes ? "estimate" : "none");
  const hasSales = source === "pos" || source === "manual";
  const missing = source === "pos" ? margin.pos?.missingEscandallo ?? null : null;
  const estCount = margin.estimatedCosts?.count ?? 0;
  // topProduct ≠ null ⟺ al menos un producto vendido tiene coste (real o aprox.)
  const hasCostedSales = margin.topProduct !== null;

  /* ── 1. Ventas del mes ── */
  const sales: ChecklistStep =
    source === "pos"
      ? { id: "sales", state: "completado", title: "Registra tus ventas", desc: "Ventas reales del TPV conectadas: usamos tus tickets de este mes." }
      : source === "manual"
        ? { id: "sales", state: "completado", title: "Registra tus ventas", desc: "Este mes usas ventas manuales. Cuando el TPV registre tickets, mandarán ellos." }
        : {
            id: "sales", state: "pendiente", title: "Registra tus ventas",
            desc: "Vende por el TPV o apunta unidades a mano: sin ventas no hay mes que leer.",
            cta: { label: "Añadir ventas", action: "manual-sales" },
          };

  /* ── 2. Vincular lo vendido a escandallos ── */
  let link: ChecklistStep;
  if (!hasSales) {
    link = { id: "link", state: "pendiente", title: "Vincula lo vendido a su escandallo", desc: "Se activa cuando haya ventas registradas." };
  } else if (missing && missing.count > 0) {
    link = {
      id: "link", state: "pendiente", title: "Vincula lo vendido a su escandallo",
      desc: `${missing.count} ${plural(missing.count, "producto vendido", "productos vendidos")} (${eur(missing.revenue)}) sin coste asociado: ese margen no se calcula.`,
      cta: { label: "Vincular productos", action: "summary" },
    };
  } else if (hasCostedSales) {
    link = {
      id: "link", state: "completado", title: "Vincula lo vendido a su escandallo",
      desc: source === "manual" ? "Tus ventas manuales ya van por escandallo." : "Todo lo vendido este mes tiene coste asociado.",
    };
  } else {
    link = { id: "link", state: "pendiente", title: "Vincula lo vendido a su escandallo", desc: "Hay ventas pero ningún producto con coste todavía.", cta: { label: "Vincular productos", action: "summary" } };
  }

  /* ── 3. Coste aproximado como atajo del primer día ── */
  let quickCost: ChecklistStep;
  if (missing && missing.count > 0) {
    quickCost = {
      id: "quick-cost", state: "pendiente", title: "Pon un coste aproximado donde falte",
      desc: "Al vincular puedes poner un coste aprox. por unidad: margen provisional al instante, sin esperar a los ingredientes.",
      cta: { label: "Ponerlo al vincular", action: "summary" },
    };
  } else if (estCount > 0) {
    quickCost = {
      id: "quick-cost", state: "completado", title: "Pon un coste aproximado donde falte",
      desc: `${estCount} ${plural(estCount, "producto usa", "productos usan")} coste aproximado: suficiente para orientarte.`,
    };
  } else if (hasCostedSales) {
    quickCost = { id: "quick-cost", state: "completado", title: "Pon un coste aproximado donde falte", desc: "No lo necesitas: tus costes ya vienen de ingredientes reales." };
  } else {
    quickCost = { id: "quick-cost", state: "pendiente", title: "Pon un coste aproximado donde falte", desc: "Se activa cuando haya ventas: es el atajo para ver margen el primer día." };
  }

  /* ── 4. Escandallos reales (ingredientes con coste) ── */
  let realRecipes: ChecklistStep;
  if (estCount > 0) {
    realRecipes = {
      id: "real-recipes", state: "atencion", title: "Completa escandallos reales",
      desc: `${estCount} ${plural(estCount, "escandallo sigue", "escandallos siguen")} con coste aproximado (${(margin.estimatedCosts?.names ?? []).join(", ")}). Con ingredientes reales, el margen deja de ser provisional.`,
      cta: { label: "Completar ingredientes", action: "recipes" },
    };
  } else if (margin.hasRecipes && margin.pendingEscandallos > 0) {
    realRecipes = {
      id: "real-recipes", state: "pendiente", title: "Completa escandallos reales",
      desc: `${margin.pendingEscandallos} ${plural(margin.pendingEscandallos, "escandallo", "escandallos")} sin coste de ingredientes todavía.`,
      cta: { label: "Ir a Escandallos", action: "recipes" },
    };
  } else if (margin.hasRecipes) {
    realRecipes = { id: "real-recipes", state: "completado", title: "Completa escandallos reales", desc: "Tus escandallos tienen coste real de ingredientes." };
  } else {
    realRecipes = {
      id: "real-recipes", state: "pendiente", title: "Completa escandallos reales",
      desc: "Aún no hay escandallos: son la base del margen por producto.",
      cta: { label: "Crear escandallos", action: "recipes" },
    };
  }

  /* ── 5. Foto de caja (extracto) ── */
  const label = cashMonthLabel(cash.month);
  const period = input.period ?? new Date().toISOString().slice(0, 7);
  let cashStep: ChecklistStep;
  if (!cash.present) {
    cashStep = {
      id: "cash", state: "pendiente", title: "Sube tu extracto bancario",
      desc: "Sin foto de caja no podemos calcular el sueldo que puedes cobrarte.",
      cta: { label: "Subir extracto", action: "treasury" },
    };
  } else if (label !== null && cash.month !== period) {
    cashStep = {
      id: "cash", state: "atencion", title: "Sube tu extracto bancario",
      desc: `Tu última foto de caja es de ${label}: puede estar desactualizada.`,
      cta: { label: "Actualizar extracto", action: "treasury" },
    };
  } else {
    cashStep = {
      id: "cash", state: "completado", title: "Sube tu extracto bancario",
      desc: label ? `Foto de caja de ${label} cargada.` : "Foto de caja cargada.",
    };
  }

  /* ── 6. Revisar la Lectura rápida ── */
  const review: ChecklistStep =
    hasSales && hasCostedSales
      ? {
          id: "review", state: "completado", title: "Revisa tu Lectura rápida",
          desc: "Tu diagnóstico ya tiene contenido: arriba, en el Resumen del mes.",
          cta: { label: "Ver Lectura rápida", action: "summary" },
        }
      : hasSales
        ? {
            id: "review", state: "atencion", title: "Revisa tu Lectura rápida",
            desc: "Hay ventas pero ningún coste: la lectura aún no puede decir mucho.",
            cta: { label: "Ver Lectura rápida", action: "summary" },
          }
        : { id: "review", state: "pendiente", title: "Revisa tu Lectura rápida", desc: "Se llenará cuando haya ventas y costes que leer." };

  const steps = [sales, link, quickCost, realRecipes, cashStep, review];
  const completed = steps.filter((s) => s.state === "completado").length;

  // Base suficiente: ventas registradas + todo lo vendido con coste + foto de
  // caja presente (vieja vale: el paso 5 ya lo marca con atención).
  const ready = sales.state === "completado" && link.state === "completado" && cash.present;

  return { steps, completed, total: steps.length, ready };
}
