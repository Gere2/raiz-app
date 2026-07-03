/**
 * lib/treasury/classify.ts
 *
 * classifyMovement(): pipeline determinista regla → fallback.
 *
 * Función pura. No toca Firestore. Recibe el movimiento y la lista de reglas
 * activas, devuelve la clasificación resuelta más metadatos de trazabilidad
 * (classifierSource, classifierReason, ruleVersion).
 *
 * Mentalidad CFO: si nada matchea y el importe es negativo, NO se mete en una
 * categoría inventada — se devuelve `needs_review` con confidence 0 para que
 * el panel mensual pueda contar y exponer el "sin clasificar".
 */

import type {
  ClassificationResult,
  Matcher,
  MovementForClassify,
  TreasuryRule,
} from "./types";

export function classifyMovement(
  movement: MovementForClassify,
  rules: TreasuryRule[]
): ClassificationResult {
  const sorted = rules
    .filter((r) => r.active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (ruleMatches(movement, rule)) {
      return {
        category: rule.action.category,
        subcategory: rule.action.subcategory,
        flowKind: rule.action.flowKind,
        supplierName:
          rule.action.supplierName ?? movement.supplierName ?? undefined,
        confidence: rule.action.confidence,
        classifierSource: `rule:${rule.id}`,
        classifierReason: `Coincide con regla "${rule.name}"`,
        ruleVersion: rule.version,
      };
    }
  }

  // Nada matcheó — fallback honesto (no maquillamos).
  if (movement.amount > 0) {
    return {
      category: "otros",
      flowKind: "income_other",
      confidence: 0.3,
      classifierSource: "default",
      classifierReason: "Ingreso sin regla — clasificado como ingreso genérico",
    };
  }
  return {
    category: "otros",
    flowKind: "needs_review",
    confidence: 0,
    classifierSource: "default",
    classifierReason: "Ningún match de regla — requiere revisión manual",
  };
}

function ruleMatches(movement: MovementForClassify, rule: TreasuryRule): boolean {
  if (rule.amountSign === "positive" && !(movement.amount > 0)) return false;
  if (rule.amountSign === "negative" && !(movement.amount < 0)) return false;
  if (!rule.matchers || rule.matchers.length === 0) return false;
  return rule.matchers.every((m) => matcherPasses(movement, m));
}

function matcherPasses(movement: MovementForClassify, m: Matcher): boolean {
  // Normaliza espacios múltiples: los extractos BBVA traen dobles espacios
  // ("GENERAL RISK  PREVENTION") que rompían los keywordsAny (includes exacto).
  const text = fieldText(movement, m.field).toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;

  if (m.keywordsAny && m.keywordsAny.length > 0) {
    const hit = m.keywordsAny.some((k) => text.includes(k.toLowerCase()));
    if (!hit) return false;
  }
  if (m.regex) {
    try {
      if (!new RegExp(m.regex, "i").test(text)) return false;
    } catch {
      return false;
    }
  }
  if (!m.keywordsAny && !m.regex) return false;
  return true;
}

function fieldText(movement: MovementForClassify, field: Matcher["field"]): string {
  const concept = (movement.concept ?? "").trim();
  const supplier = (movement.supplierName ?? "").trim();
  switch (field) {
    case "concept":
      return concept;
    case "supplierName":
      return supplier;
    case "concept_or_supplier":
      return `${concept} ${supplier}`.trim();
    default:
      return concept;
  }
}

/** Deriva el mes de caja (YYYY-MM) de una fecha YYYY-MM-DD. */
export function deriveCashMonth(date: string | undefined | null): string | null {
  if (!date) return null;
  const m = String(date).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Mapea el resultado de la clasificación al `status` legacy del schema viejo
 * para que la UI actual (overview/movements/upload) siga funcionando.
 */
export function classificationToLegacyStatus(
  cls: ClassificationResult
): "pending" | "categorized" | "matched" {
  if (cls.classifierSource === "default" || cls.flowKind === "needs_review") {
    return "pending";
  }
  return cls.supplierName ? "matched" : "categorized";
}
