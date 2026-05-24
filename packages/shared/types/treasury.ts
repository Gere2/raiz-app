/**
 * types/treasury.ts — Tesorería: extractos bancarios, movimientos y gastos trimestrales
 *
 * Permite descubrir gastos a partir de extractos bancarios (PDF o CSV),
 * categorizar movimientos, vincular a proveedores y generar vistas trimestrales.
 */

/* ─── Categorías de gasto ────────────────────────────────────── */

export type ExpenseCategory =
  | "materia_prima"
  | "packaging"
  | "servicios"
  | "alquiler"
  | "suministros"
  | "personal"
  | "impuestos"
  | "seguros"
  | "marketing"
  | "equipamiento"
  | "mantenimiento"
  | "bancarios"
  | "logistica"
  | "otros";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materia_prima: "Materia prima",
  packaging: "Packaging",
  servicios: "Servicios profesionales",
  alquiler: "Alquiler",
  suministros: "Suministros (luz, agua, gas)",
  personal: "Personal",
  impuestos: "Impuestos y tasas",
  seguros: "Seguros",
  marketing: "Marketing y publicidad",
  equipamiento: "Equipamiento",
  mantenimiento: "Mantenimiento",
  bancarios: "Gastos bancarios",
  logistica: "Logística y transporte",
  otros: "Otros",
};

/* ─── Movimiento bancario individual ─────────────────────────── */

export interface BankMovement {
  id: string;
  /** Fecha de la operación */
  date: string; // YYYY-MM-DD
  /** Fecha valor (cuando aplica) */
  valueDate?: string;
  /** Concepto tal como aparece en el extracto */
  concept: string;
  /** Concepto limpio / normalizado por IA */
  conceptNormalized?: string;
  /** Importe (negativo = cargo, positivo = abono) */
  amount: number;
  /** Saldo tras la operación (si disponible) */
  balance?: number;
  /** Categoría de gasto asignada */
  category?: ExpenseCategory;
  /** ID del proveedor vinculado (si se ha matcheado) */
  supplierId?: string;
  /** Nombre del proveedor (denormalizado para UI) */
  supplierName?: string;
  /** Referencia de la factura vinculada (si existe) */
  invoiceRef?: string;
  /** Si es un gasto (amount < 0) o un ingreso */
  type: "gasto" | "ingreso";
  /** Notas manuales del usuario */
  notes?: string;
  /** Estado de categorización */
  status: "pending" | "categorized" | "matched";
}

/* ─── Extracto bancario (documento subido) ───────────────────── */

export interface BankStatement {
  id: string;
  /** Nombre del archivo original */
  fileName: string;
  /** Formato de origen */
  sourceFormat: "pdf" | "csv" | "xlsx";
  /** Banco / entidad */
  bankName?: string;
  /** Cuenta bancaria (últimos 4 dígitos) */
  accountLast4?: string;
  /** Periodo cubierto */
  periodStart?: string;
  periodEnd?: string;
  /** Resumen */
  totalMovements: number;
  totalExpenses: number;
  totalIncome: number;
  /** Estado de procesamiento */
  processingStatus: "processing" | "completed" | "error";
  errorMessage?: string;
  /** Quién lo subió */
  uploadedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/* ─── Vista trimestral agregada ──────────────────────────────── */

export interface QuarterSummary {
  quarter: string; // "2026-Q1", "2026-Q2", etc.
  year: number;
  quarterNumber: 1 | 2 | 3 | 4;
  /** Totales */
  totalExpenses: number;
  totalIncome: number;
  netFlow: number;
  /** Desglose por categoría */
  byCategory: Array<{
    category: ExpenseCategory;
    label: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  /** Top proveedores del trimestre */
  topSuppliers: Array<{
    supplierId?: string;
    supplierName: string;
    total: number;
    count: number;
  }>;
  /** Comparación con trimestre anterior */
  vsPrevQuarter?: {
    expensesDelta: number;
    expensesDeltaPct: number;
  };
}

/* ─── Resultado de extracción AI (para PDF) ──────────────────── */

export interface BankStatementExtraction {
  bankName?: string;
  accountLast4?: string;
  periodStart?: string;
  periodEnd?: string;
  movements: Array<{
    date: string;
    valueDate?: string;
    concept: string;
    amount: number;
    balance?: number;
  }>;
}

/* ─── Sugerencia de categorización AI ────────────────────────── */

export interface CategorizationSuggestion {
  movementId: string;
  suggestedCategory: ExpenseCategory;
  suggestedSupplier?: string;
  confidence: number; // 0-1
  reasoning?: string;
}
