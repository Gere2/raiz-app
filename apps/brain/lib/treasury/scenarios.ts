/**
 * lib/treasury/scenarios.ts
 *
 * Semáforo del negocio + sueldo posible Geremi + tickets extra (PR5).
 *
 * Función pura. Recibe un MonthlySnapshot ya calculado por monthly-aggregator
 * y devuelve los KPIs CFO derivados:
 *
 *   • semaforo:        verde / amarillo / rojo, con el motivo en lenguaje claro.
 *   • possibleSalary:  sueldo máximo, recomendado, gap a objetivo y tickets/día
 *                      extras necesarios para cerrar el gap.
 *   • scenarios:       tabla con 5 escenarios de sueldo (por defecto 0/500/1k/1.5k/2k).
 *
 * Reglas del semáforo (extraídas de la spec inicial):
 *
 *   VERDE     — Cash ≥ 0 Y económico-con-sueldo ≥ 0.
 *               Paga proveedores, accruals e imputa sueldo, queda caja libre.
 *
 *   AMARILLO  — Cash ≥ 0 PERO económico-con-sueldo < 0.
 *               Paga proveedores con caja del mes, pero no cubre el coste real:
 *               el sueldo Geremi se paga "a costa del negocio" o aplazando algo.
 *
 *   ROJO      — Cash < 0.
 *               El mes pierde caja. Pagas más de lo que entra,
 *               independientemente de cómo te lo cuentes económicamente.
 *
 * Sueldo posible (CFO mode):
 *
 *   sueldoMaximoCaja      = max(0, resultadoCaja)
 *   sueldoMaximoEconomico = max(0, resultadoEconomicoAntesSueldoFundador)
 *   sueldoMaximo          = min de los dos (el más restrictivo)
 *   sueldoRecomendado     = sueldoMaximo × 0.7  (buffer prudencial 30%)
 *
 * Tickets extra:
 *
 *   gap = sueldoObjetivo - sueldoMaximo
 *   marginRatio = 1 - foodCostTarget        (default 70%)
 *   ventasExtraEur = gap / marginRatio
 *   ticketsExtraMes = ceil(ventasExtraEur / avgTicket)
 *   ticketsExtraDia = ceil(ticketsExtraMes / operatingDaysPerMonth)
 */

import type { TreasuryAssumptions } from "./types";
import type { MonthlySnapshot } from "./monthly-aggregator";

/* ─── Tipos ─────────────────────────────────────────────────── */

export type SemaforoEstado = "verde" | "amarillo" | "rojo";

export type Semaforo = {
  estado: SemaforoEstado;
  reason: string;
  salaryUsed: number;
  cashWithSalary: number;
  economicWithSalary: number;
};

export type SalaryScenario = {
  salary: number;
  cashWithSalary: number;
  economicWithSalary: number;
  semaforo: SemaforoEstado;
  reason: string;
};

export type PossibleSalary = {
  // Lo que el negocio aguanta con caja positiva
  sueldoMaximoCaja: number;
  sueldoMaximoEconomico: number;
  sueldoMaximo: number; // min de los dos
  sueldoRecomendadoPrudente: number; // 70% del max

  // Si tiene sueldo objetivo
  sueldoObjetivo: number;
  gap: number; // positivo = falta dinero; negativo = sobra
  ventasExtraMesEur: number; // ventas extra requeridas para cerrar el gap
  ticketsExtraMes: number;
  ticketsExtraDia: number;

  // Trazabilidad de los inputs
  inputs: {
    avgTicket: number;
    operatingDaysPerMonth: number;
    grossMarginRatio: number; // 1 - foodCostTarget
    resultadoCaja: number;
    resultadoEconAntesSueldo: number;
  };
};

export type SnapshotEnrichment = {
  semaforo: Semaforo;
  possibleSalary: PossibleSalary;
  scenarios: SalaryScenario[];
};

const DEFAULT_SCENARIO_SALARIES = [0, 500, 1000, 1500, 2000];

/* ─── Helpers ───────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifySemaforo(
  cashWithSalary: number,
  economicWithSalary: number,
  salary: number
): { estado: SemaforoEstado; reason: string } {
  // Tolerancia de 1 céntimo por redondeos
  const cashOk = cashWithSalary >= -0.005;
  const econOk = economicWithSalary >= -0.005;

  if (cashOk && econOk) {
    return {
      estado: "verde",
      reason: `Caja libre ${round2(cashWithSalary)} € y económico ${round2(economicWithSalary)} € positivos con sueldo ${salary} €.`,
    };
  }
  if (cashOk && !econOk) {
    return {
      estado: "amarillo",
      reason: `Cash ok (${round2(cashWithSalary)} €) pero económico negativo (${round2(economicWithSalary)} €) — pagas el mes pero no cubres coste real con sueldo ${salary} €.`,
    };
  }
  return {
    estado: "rojo",
    reason: `Caja negativa (${round2(cashWithSalary)} €) — el mes pierde dinero con sueldo ${salary} €. ${econOk ? "Económicamente OK pero la caja no aguanta." : "Económico también en negativo."}`,
  };
}

/* ─── Semáforo de un sueldo concreto ────────────────────────── */

export function computeSemaforo(
  snapshot: MonthlySnapshot,
  salary: number
): Semaforo {
  const cashBase = snapshot.cash.resultadoCaja;
  const econBase = snapshot.economic.resultadoEconomicoAntesSueldoFundador;

  const cashWithSalary = round2(cashBase - salary);
  const economicWithSalary = round2(econBase - salary);

  const { estado, reason } = classifySemaforo(cashWithSalary, economicWithSalary, salary);

  return {
    estado,
    reason,
    salaryUsed: salary,
    cashWithSalary,
    economicWithSalary,
  };
}

/* ─── Sueldo posible Geremi ─────────────────────────────────── */

export function computePossibleSalary(
  snapshot: MonthlySnapshot,
  assumptions: TreasuryAssumptions,
  sueldoObjetivoOverride?: number
): PossibleSalary {
  const cashBase = snapshot.cash.resultadoCaja;
  const econBase = snapshot.economic.resultadoEconomicoAntesSueldoFundador;

  const sueldoMaximoCaja = Math.max(0, cashBase);
  const sueldoMaximoEconomico = Math.max(0, econBase);
  const sueldoMaximo = Math.min(sueldoMaximoCaja, sueldoMaximoEconomico);
  const sueldoRecomendadoPrudente = sueldoMaximo * 0.7;

  const sueldoObjetivo =
    sueldoObjetivoOverride ??
    assumptions.foundersSalaryTarget ??
    assumptions.foundersSalary ??
    0;

  const gap = sueldoObjetivo - sueldoMaximo;
  const grossMarginRatio = Math.max(
    0.05, // suelo defensivo: nunca división por casi-cero
    1 - (assumptions.foodCostTarget ?? 0.3)
  );

  let ventasExtraMesEur = 0;
  let ticketsExtraMes = 0;
  let ticketsExtraDia = 0;

  if (gap > 0) {
    ventasExtraMesEur = gap / grossMarginRatio;
    const avg = assumptions.avgTicket > 0 ? assumptions.avgTicket : 3.5;
    ticketsExtraMes = Math.ceil(ventasExtraMesEur / avg);
    const days = assumptions.operatingDaysPerMonth > 0 ? assumptions.operatingDaysPerMonth : 22;
    ticketsExtraDia = Math.ceil(ticketsExtraMes / days);
  }

  return {
    sueldoMaximoCaja: round2(sueldoMaximoCaja),
    sueldoMaximoEconomico: round2(sueldoMaximoEconomico),
    sueldoMaximo: round2(sueldoMaximo),
    sueldoRecomendadoPrudente: round2(sueldoRecomendadoPrudente),
    sueldoObjetivo: round2(sueldoObjetivo),
    gap: round2(gap),
    ventasExtraMesEur: round2(ventasExtraMesEur),
    ticketsExtraMes,
    ticketsExtraDia,
    inputs: {
      avgTicket: assumptions.avgTicket,
      operatingDaysPerMonth: assumptions.operatingDaysPerMonth,
      grossMarginRatio: round2(grossMarginRatio),
      resultadoCaja: round2(cashBase),
      resultadoEconAntesSueldo: round2(econBase),
    },
  };
}

/* ─── Tabla de escenarios ───────────────────────────────────── */

export function computeSalaryScenarios(
  snapshot: MonthlySnapshot,
  salaries: number[] = DEFAULT_SCENARIO_SALARIES
): SalaryScenario[] {
  return salaries.map((salary) => {
    const s = computeSemaforo(snapshot, salary);
    return {
      salary,
      cashWithSalary: s.cashWithSalary,
      economicWithSalary: s.economicWithSalary,
      semaforo: s.estado,
      reason: s.reason,
    };
  });
}

/* ─── Enrichment combinado ──────────────────────────────────── */

/**
 * Enriquece un MonthlySnapshot con semáforo + sueldo posible + escenarios.
 * Usa el sueldo de assumptions como referencia (semáforo principal) y los
 * 5 estándar (0/500/1k/1.5k/2k) como tabla de escenarios.
 */
export function enrichSnapshot(
  snapshot: MonthlySnapshot,
  assumptions: TreasuryAssumptions,
  customScenarioSalaries?: number[]
): SnapshotEnrichment {
  const principalSalary = assumptions.foundersSalary ?? 0;
  const semaforo = computeSemaforo(snapshot, principalSalary);
  const possibleSalary = computePossibleSalary(snapshot, assumptions);
  const scenarios = computeSalaryScenarios(
    snapshot,
    customScenarioSalaries ?? DEFAULT_SCENARIO_SALARIES
  );
  return { semaforo, possibleSalary, scenarios };
}

export const SCENARIO_SALARIES_DEFAULT = DEFAULT_SCENARIO_SALARIES;
