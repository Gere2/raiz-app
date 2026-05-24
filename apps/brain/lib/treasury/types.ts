/**
 * lib/treasury/types.ts
 *
 * Tipos del Treasury Truth Layer (PR1).
 *
 * Diseño: aditivo y compatible con el schema legacy de bank_movements.
 * Ningún campo nuevo es required en lectura; los movimientos viejos siguen
 * funcionando hasta que se ejecute la reclasificación batch que los rellena.
 */

/** Naturaleza económica del movimiento. Más fino que `type` legacy. */
export type FlowKind =
  | "income_sales_tpv"
  | "income_other"
  | "expense_operating"
  | "internal_transfer"
  | "partner_drawing"
  | "card_pending"
  | "needs_review";

/** Restricción opcional sobre el signo del importe del movimiento. */
export type AmountSign = "positive" | "negative" | "any";

/** Campo del movimiento contra el que se hace el match. */
export type MatcherField = "concept" | "supplierName" | "concept_or_supplier";

/**
 * Un matcher pasa cuando TODAS las condiciones declaradas pasan
 * (keywordsAny = al menos una keyword presente; regex = el regex matchea).
 */
export type Matcher = {
  field: MatcherField;
  keywordsAny?: string[];
  regex?: string;
};

export type RuleAction = {
  category: string;
  subcategory?: string;
  flowKind: FlowKind;
  supplierName?: string;
  confidence: number;
};

/**
 * Regla de clasificación. Las reglas se aplican en orden de prioridad
 * descendente; gana la primera que matchea. Cada regla guarda versión
 * para que un movimiento clasificado registre con qué versión se hizo.
 */
export type TreasuryRule = {
  id: string;
  name: string;
  priority: number;
  version: number;
  active: boolean;
  matchers: Matcher[];
  amountSign?: AmountSign;
  action: RuleAction;
  source: "seed" | "manual" | "learned";
  learnedFrom?: { movementId: string; originalCategory?: string };
  notes?: string;
};

export type TreasuryAccountRole =
  | "tpv_collection"
  | "operating"
  | "card"
  | "other";

export type TreasuryBank = "santander" | "bbva" | "other";

/**
 * Una cuenta bancaria de la organización. ID estable en formato
 * `<bank>_<last4>`, fallback `<bank>_main` cuando no se conoce el last4.
 */
export type TreasuryAccount = {
  id: string;
  bank: TreasuryBank;
  alias: string;
  last4?: string;
  role: TreasuryAccountRole;
  active: boolean;
};

/**
 * Supuestos económicos del negocio. El doc `_default` aplica a todos los meses;
 * `YYYY-MM` lo sobrescribe punto por punto.
 */
export type TreasuryAssumptions = {
  foundersSalary: number;
  foundersSalaryTarget: number;
  avgTicket: number;
  ticketsPerMonth?: number;
  operatingDaysPerMonth: number;
  foodCostTarget: number;
  foodCostUpper: number;
  grossMarginTarget: number;
  cashSalesEstimate: number;
  notes?: string;
};

/** Resultado puro del clasificador. No toca Firestore. */
export type ClassificationResult = {
  category: string;
  subcategory?: string;
  flowKind: FlowKind;
  supplierName?: string;
  confidence: number;
  classifierSource: string;
  classifierReason: string;
  ruleVersion?: number;
};

/** Input mínimo necesario para clasificar un movimiento. */
export type MovementForClassify = {
  concept?: string | null;
  supplierName?: string | null;
  amount: number;
};
