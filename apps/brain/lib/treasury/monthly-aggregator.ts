/**
 * lib/treasury/monthly-aggregator.ts
 *
 * Agregador mensual del Treasury Truth Layer (PR3).
 *
 * Función PURA. No toca Firestore. Recibe movimientos + accruals + assumptions
 * para un mes y devuelve un MonthlySnapshot con dos vistas:
 *
 *   • cash:     ¿qué entró y salió del banco este mes?
 *               Excluye internal_transfer (porque sale de una cuenta y entra
 *               en otra propia). Incluye card_pending y partner_drawing
 *               (D1, D2: el dinero ya salió del banco).
 *
 *   • economic: ¿qué corresponde económicamente a este mes?
 *               Usa economicMonth con fallback a cashMonth. Suma accruals
 *               cuya economicMonth = monthId (PR4 los rellenará). Resta el
 *               sueldo fundador imputado de assumptions.
 *
 * Mentalidad CFO:
 *   - card_pending y partner_drawing aparecen como buckets propios — NO
 *     se mezclan con gasto operativo (D1, D2).
 *   - sin clasificar > 3% del volumen mensual genera warning.
 *   - income_other con hint de traspaso genera warning específico.
 *   - Cada número trae sourceMovementIds (trazabilidad pediátrica).
 */

import type {
  FlowKind,
  TreasuryAssumptions,
} from "./types";
import { hasTransferHint } from "./transfer-detector";
import {
  enrichSnapshot,
  type PossibleSalary,
  type SalaryScenario,
  type Semaforo,
} from "./scenarios";

/* ─── Tipos de input ────────────────────────────────────────── */

export type AggregatorMovement = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  concept?: string | null;
  category?: string | null;
  subcategory?: string | null;
  flowKind?: FlowKind | string | null;
  classifierSource?: string | null;
  cashMonth?: string | null; // YYYY-MM
  economicMonth?: string | null; // YYYY-MM (override manual; PR4 lo gestiona)
  accountId?: string | null;
};

export type AggregatorAccrual = {
  id: string;
  economicMonth: string;
  amount: number; // negativo = gasto, positivo = ingreso
  category: string;
  subcategory?: string;
  description?: string;
  status?: "pending" | "paid" | "cancelled";
};

export type AggregatorInput = {
  monthId: string; // YYYY-MM
  movements: AggregatorMovement[];
  accruals?: AggregatorAccrual[];
  assumptions: TreasuryAssumptions;
};

/* ─── Tipos de output ───────────────────────────────────────── */

export type MonthlyBucket = {
  total: number;
  count: number;
  sourceIds: string[];
};

export type CashView = {
  // Ingresos
  ventasTpv: MonthlyBucket;
  ingresosOtros: MonthlyBucket;
  ingresosTotales: number;

  // Gastos operativos (suman al resultado operativo)
  costeProductoPagado: MonthlyBucket; // materia_prima + packaging
  suministros: MonthlyBucket;
  tecnologia: MonthlyBucket;
  gestoria: MonthlyBucket;
  transporte: MonthlyBucket;
  personalPagado: MonthlyBucket; // personal sin SS autónomo
  otrosGastos: MonthlyBucket;
  gastosOperativosTotales: number;

  // Cargas fiscales (separadas para visibilidad)
  impuestosAEAT: MonthlyBucket;
  seguridadSocial: MonthlyBucket;

  // Buckets que SÍ restan caja pero NO son gasto operativo definitivo
  tarjetaPendiente: MonthlyBucket; // D1
  disposicionSocio: MonthlyBucket; // D2

  // Buckets visibles pero EXCLUIDOS del resultado
  traspasosInternos: MonthlyBucket; // se compensan entre cuentas
  sinClasificar: MonthlyBucket; // forzar revisión manual

  // Métricas de transparencia
  volumenAbsolutoTotal: number; // sum(abs) de TODO (incluye traspasos)
  pctSinClasificar: number; // sinClasificar.|total| / volumenAbsolutoTotal

  // Resultados
  resultadoOperativoCaja: number; // ingresos - gastos operativos (sin impuestos/SS/card/socio)
  resultadoCajaAntesImpuestos: number; // ingresos - gastos operativos - card_pending - disposicion_socio
  resultadoCaja: number; // todo lo anterior - impuestos - SS  (variación neta del banco, ex traspasos)
};

export type EconomicView = {
  // Mismas categorías que cash, pero con economicMonth y accruals
  ventasTpv: MonthlyBucket;
  ingresosOtros: MonthlyBucket;
  ingresosTotales: number;

  costeProductoConsumido: MonthlyBucket;
  suministros: MonthlyBucket;
  tecnologia: MonthlyBucket;
  gestoria: MonthlyBucket;
  transporte: MonthlyBucket;
  personalDevengado: MonthlyBucket;
  otrosGastos: MonthlyBucket;
  gastosOperativosTotales: number;

  impuestosAEAT: MonthlyBucket;
  seguridadSocial: MonthlyBucket;

  // Movido fuera del mes vía economicMonth override (informativo)
  movimientosReasignados: { aOtroMes: string[]; deOtroMes: string[] };

  // Accruals que PR4 introducirá (en PR3 vacíos)
  accrualsAplicados: { count: number; total: number; ids: string[] };

  // Sueldo fundador imputado de assumptions
  sueldoFundadorImputado: number;

  // Resultados
  resultadoOperativoAntesImpuestos: number;
  resultadoEconomicoAntesSueldoFundador: number;
  resultadoEconomicoConSueldoFundador: number;
};

export type FoodCostView = {
  ventasBase: number; // ventasTpv (cash) — base para el ratio
  comprasMateriaPrimaPackaging: number; // pagado en el mes
  foodCostPagado: number; // 0..1 ratio
  foodCostPagadoPct: number; // % redondeado 2 decimales
  target: number; // de assumptions (0.30)
  alerta: number; // de assumptions (0.40)
  estado: "verde" | "amarillo" | "rojo" | "sin_datos";
  // foodCostConsumido se rellenará con stock + accruals en PR4/PR5
  foodCostConsumido: null;
};

export type SnapshotWarning = {
  code:
    | "sin_clasificar_alto"
    | "income_other_sospechoso_traspaso"
    | "card_pending_no_desglosada"
    | "ventas_cero"
    | "mes_vacio";
  severity: "info" | "warn" | "danger";
  message: string;
  affectedIds?: string[];
  metric?: number;
};

export type MonthlySnapshot = {
  monthId: string;
  computedAt: string; // ISO
  scenarioHash: string; // hash de inputs clave (assumptions) para invalidación
  totalMovements: number;
  cash: CashView;
  economic: EconomicView;
  foodCost: FoodCostView;
  assumptionsApplied: TreasuryAssumptions;
  warnings: SnapshotWarning[];
  sourceMovementIds: string[]; // todos los del cash view (trazabilidad)

  // PR5 — KPIs CFO derivados (opcionales por compatibilidad ascendente)
  semaforo?: Semaforo;
  possibleSalary?: PossibleSalary;
  scenarios?: SalaryScenario[];
};

/* ─── Helpers internos ──────────────────────────────────────── */

const emptyBucket = (): MonthlyBucket => ({ total: 0, count: 0, sourceIds: [] });

function pushBucket(b: MonthlyBucket, amount: number, id: string): void {
  b.total += amount;
  b.count += 1;
  b.sourceIds.push(id);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finalizeBucket(b: MonthlyBucket): MonthlyBucket {
  return { total: round2(b.total), count: b.count, sourceIds: b.sourceIds };
}

/**
 * Decide en qué bucket de la vista cash cae un movimiento dado.
 * Devuelve null si el movimiento no debe entrar en cash de este mes.
 */
function bucketCash(
  m: AggregatorMovement
): keyof CashView | null {
  const fk = (m.flowKind ?? "needs_review") as FlowKind;

  switch (fk) {
    case "income_sales_tpv":
      return "ventasTpv";
    case "income_other":
      return "ingresosOtros";
    case "internal_transfer":
      return "traspasosInternos";
    case "partner_drawing":
      return "disposicionSocio";
    case "card_pending":
      return "tarjetaPendiente";
    case "needs_review":
      return "sinClasificar";
    case "expense_operating": {
      const cat = (m.category ?? "").toLowerCase();
      const sub = (m.subcategory ?? "").toLowerCase();
      if (cat === "materia_prima" || cat === "packaging") return "costeProductoPagado";
      if (cat === "impuestos") return "impuestosAEAT";
      if (cat === "personal" && sub === "autonomo_ss") return "seguridadSocial";
      if (cat === "personal") return "personalPagado";
      if (cat === "suministros") return "suministros";
      if (cat === "tecnologia") return "tecnologia";
      if (cat === "servicios" && sub === "gestoria") return "gestoria";
      if (cat === "logistica") return "transporte";
      return "otrosGastos";
    }
    default:
      return "sinClasificar";
  }
}

/** Mapea bucket cash → bucket económico (mayoría 1:1 con renombres). */
function bucketEconomic(
  cashBucket: keyof CashView
): keyof EconomicView | null {
  switch (cashBucket) {
    case "ventasTpv": return "ventasTpv";
    case "ingresosOtros": return "ingresosOtros";
    case "costeProductoPagado": return "costeProductoConsumido";
    case "suministros": return "suministros";
    case "tecnologia": return "tecnologia";
    case "gestoria": return "gestoria";
    case "transporte": return "transporte";
    case "personalPagado": return "personalDevengado";
    case "otrosGastos": return "otrosGastos";
    case "impuestosAEAT": return "impuestosAEAT";
    case "seguridadSocial": return "seguridadSocial";

    // Buckets que NO entran en económico:
    case "tarjetaPendiente": return null; // pendiente de desglose
    case "traspasosInternos": return null;
    case "disposicionSocio": return null; // se imputa vía sueldo fundador, no aquí
    case "sinClasificar": return null; // no podemos imputar sin saber qué es

    // Resultados/totales: no son buckets clasificables
    default:
      return null;
  }
}

function scenarioHash(a: TreasuryAssumptions): string {
  // Determinístico, suficiente para detectar cambios de escenario
  return [
    a.foundersSalary,
    a.foundersSalaryTarget,
    a.avgTicket,
    a.operatingDaysPerMonth,
    a.foodCostTarget,
    a.foodCostUpper,
    a.grossMarginTarget,
    a.cashSalesEstimate,
  ].join("|");
}

/* ─── Aggregator ────────────────────────────────────────────── */

export function aggregateMonth(input: AggregatorInput): MonthlySnapshot {
  const { monthId, assumptions } = input;
  const accruals = input.accruals ?? [];

  // Inicializa buckets vacíos
  const cash: CashView = {
    ventasTpv: emptyBucket(),
    ingresosOtros: emptyBucket(),
    ingresosTotales: 0,
    costeProductoPagado: emptyBucket(),
    suministros: emptyBucket(),
    tecnologia: emptyBucket(),
    gestoria: emptyBucket(),
    transporte: emptyBucket(),
    personalPagado: emptyBucket(),
    otrosGastos: emptyBucket(),
    gastosOperativosTotales: 0,
    impuestosAEAT: emptyBucket(),
    seguridadSocial: emptyBucket(),
    tarjetaPendiente: emptyBucket(),
    disposicionSocio: emptyBucket(),
    traspasosInternos: emptyBucket(),
    sinClasificar: emptyBucket(),
    volumenAbsolutoTotal: 0,
    pctSinClasificar: 0,
    resultadoOperativoCaja: 0,
    resultadoCajaAntesImpuestos: 0,
    resultadoCaja: 0,
  };

  const economic: EconomicView = {
    ventasTpv: emptyBucket(),
    ingresosOtros: emptyBucket(),
    ingresosTotales: 0,
    costeProductoConsumido: emptyBucket(),
    suministros: emptyBucket(),
    tecnologia: emptyBucket(),
    gestoria: emptyBucket(),
    transporte: emptyBucket(),
    personalDevengado: emptyBucket(),
    otrosGastos: emptyBucket(),
    gastosOperativosTotales: 0,
    impuestosAEAT: emptyBucket(),
    seguridadSocial: emptyBucket(),
    movimientosReasignados: { aOtroMes: [], deOtroMes: [] },
    accrualsAplicados: { count: 0, total: 0, ids: [] },
    sueldoFundadorImputado: 0,
    resultadoOperativoAntesImpuestos: 0,
    resultadoEconomicoAntesSueldoFundador: 0,
    resultadoEconomicoConSueldoFundador: 0,
  };

  // Detección de income_other sospechoso de traspaso
  const incomeOtherSuspectTransfer: { id: string; amount: number; concept?: string }[] = [];

  // Filtra movimientos del mes (cash o economic)
  const cashMonthMovs: AggregatorMovement[] = [];
  const economicMonthMovs: AggregatorMovement[] = [];
  let totalProcessed = 0;

  for (const m of input.movements) {
    const cm = m.cashMonth ?? null;
    const em = m.economicMonth ?? cm; // fallback
    const amt = Number(m.amount) || 0;

    if (cm === monthId) {
      cashMonthMovs.push(m);
      totalProcessed++;

      const bucket = bucketCash(m);
      if (bucket) {
        pushBucket(cash[bucket] as MonthlyBucket, amt, m.id);
        cash.volumenAbsolutoTotal += Math.abs(amt);
      }

      // Detección de income_other sospechoso de traspaso (warning D3)
      if (m.flowKind === "income_other" && hasTransferHint(m.concept)) {
        incomeOtherSuspectTransfer.push({ id: m.id, amount: amt, concept: m.concept ?? undefined });
      }

      // Si el movimiento fue reasignado a OTRO mes vía economicMonth, lo marcamos
      if (em && em !== monthId) {
        economic.movimientosReasignados.aOtroMes.push(m.id);
      }
    }

    // Vista económica: cuenta movimientos cuya economicMonth = monthId
    // (aunque la cashMonth sea diferente, p.ej. nómina de enero pagada en marzo)
    if (em === monthId) {
      economicMonthMovs.push(m);

      const cashBucket = bucketCash(m);
      if (cashBucket) {
        const ecoBucket = bucketEconomic(cashBucket);
        if (ecoBucket) {
          pushBucket(economic[ecoBucket] as MonthlyBucket, amt, m.id);
        }
      }

      // Si vino de OTRO mes (cm !== monthId), marca como reasignado entrante
      if (cm && cm !== monthId) {
        economic.movimientosReasignados.deOtroMes.push(m.id);
      }
    }
  }

  // Aplica accruals a la vista económica
  for (const a of accruals) {
    if (a.economicMonth !== monthId) continue;
    if (a.status === "cancelled") continue;
    economic.accrualsAplicados.count++;
    economic.accrualsAplicados.total += a.amount;
    economic.accrualsAplicados.ids.push(a.id);

    // Imputa al bucket correspondiente
    const cat = (a.category ?? "").toLowerCase();
    const sub = (a.subcategory ?? "").toLowerCase();
    let target: keyof EconomicView | null = null;
    if (cat === "materia_prima" || cat === "packaging") target = "costeProductoConsumido";
    else if (cat === "impuestos") target = "impuestosAEAT";
    else if (cat === "personal" && sub === "autonomo_ss") target = "seguridadSocial";
    else if (cat === "personal") target = "personalDevengado";
    else if (cat === "suministros") target = "suministros";
    else if (cat === "tecnologia") target = "tecnologia";
    else if (cat === "servicios" && sub === "gestoria") target = "gestoria";
    else if (cat === "logistica") target = "transporte";
    else if (cat === "ventas_tpv") target = "ventasTpv";
    else target = "otrosGastos";

    if (target) {
      pushBucket(economic[target] as MonthlyBucket, a.amount, `accrual:${a.id}`);
    }
  }

  // ─── Totales Cash ──────────────────────────────────────────
  cash.ingresosTotales = cash.ventasTpv.total + cash.ingresosOtros.total;

  cash.gastosOperativosTotales = (
    cash.costeProductoPagado.total +
    cash.suministros.total +
    cash.tecnologia.total +
    cash.gestoria.total +
    cash.transporte.total +
    cash.personalPagado.total +
    cash.otrosGastos.total
  );
  // Los gastos vienen como negativos, los sumamos directos

  cash.resultadoOperativoCaja =
    cash.ingresosTotales + cash.gastosOperativosTotales;

  cash.resultadoCajaAntesImpuestos =
    cash.resultadoOperativoCaja
    + cash.tarjetaPendiente.total // negativo
    + cash.disposicionSocio.total // negativo
    + cash.sinClasificar.total;   // negativo (suele serlo)

  cash.resultadoCaja =
    cash.resultadoCajaAntesImpuestos
    + cash.impuestosAEAT.total
    + cash.seguridadSocial.total;

  cash.pctSinClasificar = cash.volumenAbsolutoTotal > 0
    ? Math.abs(cash.sinClasificar.total) / cash.volumenAbsolutoTotal
    : 0;

  // ─── Totales Economic ──────────────────────────────────────
  economic.ingresosTotales = economic.ventasTpv.total + economic.ingresosOtros.total;

  economic.gastosOperativosTotales = (
    economic.costeProductoConsumido.total +
    economic.suministros.total +
    economic.tecnologia.total +
    economic.gestoria.total +
    economic.transporte.total +
    economic.personalDevengado.total +
    economic.otrosGastos.total
  );

  economic.resultadoOperativoAntesImpuestos =
    economic.ingresosTotales + economic.gastosOperativosTotales;

  economic.resultadoEconomicoAntesSueldoFundador =
    economic.resultadoOperativoAntesImpuestos
    + economic.impuestosAEAT.total
    + economic.seguridadSocial.total;

  economic.sueldoFundadorImputado = assumptions.foundersSalary || 0;
  economic.resultadoEconomicoConSueldoFundador =
    economic.resultadoEconomicoAntesSueldoFundador - economic.sueldoFundadorImputado;

  // ─── Food cost ─────────────────────────────────────────────
  const ventasBase = cash.ventasTpv.total;
  const compras = Math.abs(cash.costeProductoPagado.total); // gasto positivo
  const foodCost: FoodCostView = {
    ventasBase: round2(ventasBase),
    comprasMateriaPrimaPackaging: round2(compras),
    foodCostPagado: ventasBase > 0 ? compras / ventasBase : 0,
    foodCostPagadoPct: ventasBase > 0 ? round2((compras / ventasBase) * 100) : 0,
    target: assumptions.foodCostTarget,
    alerta: assumptions.foodCostUpper,
    estado: ventasBase === 0
      ? "sin_datos"
      : compras / ventasBase <= assumptions.foodCostTarget
        ? "verde"
        : compras / ventasBase <= assumptions.foodCostUpper
          ? "amarillo"
          : "rojo",
    foodCostConsumido: null,
  };

  // ─── Warnings ──────────────────────────────────────────────
  const warnings: SnapshotWarning[] = [];

  if (totalProcessed === 0) {
    warnings.push({
      code: "mes_vacio",
      severity: "warn",
      message: `No hay movimientos en ${monthId}. ¿Falta subir el extracto?`,
    });
  }

  if (cash.pctSinClasificar > 0.03) {
    warnings.push({
      code: "sin_clasificar_alto",
      severity: "warn",
      message: `${(cash.pctSinClasificar * 100).toFixed(1)}% del volumen del mes está sin clasificar (${cash.sinClasificar.count} movimientos por ${round2(Math.abs(cash.sinClasificar.total))} €). Revisa y/o amplía las reglas.`,
      affectedIds: cash.sinClasificar.sourceIds,
      metric: cash.pctSinClasificar,
    });
  }

  if (incomeOtherSuspectTransfer.length > 0) {
    const suma = round2(incomeOtherSuspectTransfer.reduce((s, x) => s + x.amount, 0));
    warnings.push({
      code: "income_other_sospechoso_traspaso",
      severity: "warn",
      message: `${incomeOtherSuspectTransfer.length} movimientos como income_other tienen palabras de traspaso (${suma} € en total). Sube la otra cuenta o ejecuta /treasury/transfers/detect — si son traspasos internos las ventas están infladas.`,
      affectedIds: incomeOtherSuspectTransfer.map((x) => x.id),
      metric: suma,
    });
  }

  if (cash.tarjetaPendiente.count > 0) {
    warnings.push({
      code: "card_pending_no_desglosada",
      severity: "info",
      message: `${cash.tarjetaPendiente.count} movimientos de tarjeta pendiente por ${round2(Math.abs(cash.tarjetaPendiente.total))} €. Sube el extracto de la(s) tarjeta(s) para desglose real.`,
      affectedIds: cash.tarjetaPendiente.sourceIds,
      metric: Math.abs(cash.tarjetaPendiente.total),
    });
  }

  if (totalProcessed > 0 && cash.ventasTpv.total === 0) {
    warnings.push({
      code: "ventas_cero",
      severity: "danger",
      message: `0 € en ventas TPV este mes pese a tener movimientos. Probable: extracto de la cuenta TPV no subido, o regla TPV no matchea el formato real.`,
    });
  }

  // ─── Finalize buckets (round to cents) ────────────────────
  for (const b of [
    cash.ventasTpv, cash.ingresosOtros,
    cash.costeProductoPagado, cash.suministros, cash.tecnologia, cash.gestoria,
    cash.transporte, cash.personalPagado, cash.otrosGastos,
    cash.impuestosAEAT, cash.seguridadSocial,
    cash.tarjetaPendiente, cash.disposicionSocio,
    cash.traspasosInternos, cash.sinClasificar,
  ]) finalizeBucket(b);

  for (const b of [
    economic.ventasTpv, economic.ingresosOtros,
    economic.costeProductoConsumido, economic.suministros, economic.tecnologia,
    economic.gestoria, economic.transporte, economic.personalDevengado,
    economic.otrosGastos, economic.impuestosAEAT, economic.seguridadSocial,
  ]) finalizeBucket(b);

  // Round all top-level totals
  cash.ingresosTotales = round2(cash.ingresosTotales);
  cash.gastosOperativosTotales = round2(cash.gastosOperativosTotales);
  cash.resultadoOperativoCaja = round2(cash.resultadoOperativoCaja);
  cash.resultadoCajaAntesImpuestos = round2(cash.resultadoCajaAntesImpuestos);
  cash.resultadoCaja = round2(cash.resultadoCaja);
  cash.volumenAbsolutoTotal = round2(cash.volumenAbsolutoTotal);
  cash.pctSinClasificar = round2(cash.pctSinClasificar * 10000) / 10000;

  economic.ingresosTotales = round2(economic.ingresosTotales);
  economic.gastosOperativosTotales = round2(economic.gastosOperativosTotales);
  economic.resultadoOperativoAntesImpuestos = round2(economic.resultadoOperativoAntesImpuestos);
  economic.resultadoEconomicoAntesSueldoFundador = round2(economic.resultadoEconomicoAntesSueldoFundador);
  economic.resultadoEconomicoConSueldoFundador = round2(economic.resultadoEconomicoConSueldoFundador);
  economic.accrualsAplicados.total = round2(economic.accrualsAplicados.total);

  const baseSnapshot: MonthlySnapshot = {
    monthId,
    computedAt: new Date().toISOString(),
    scenarioHash: scenarioHash(assumptions),
    totalMovements: totalProcessed,
    cash,
    economic,
    foodCost,
    assumptionsApplied: assumptions,
    warnings,
    sourceMovementIds: cashMonthMovs.map((m) => m.id),
  };

  // PR5 — enriquece con semáforo, sueldo posible y escenarios.
  // Si no hay movimientos (mes vacío), saltamos para no producir números engañosos.
  if (totalProcessed > 0 || (input.accruals && input.accruals.length > 0)) {
    const enrichment = enrichSnapshot(baseSnapshot, assumptions);
    baseSnapshot.semaforo = enrichment.semaforo;
    baseSnapshot.possibleSalary = enrichment.possibleSalary;
    baseSnapshot.scenarios = enrichment.scenarios;
  }

  return baseSnapshot;
}

/* ─── Range / utilidades ────────────────────────────────────── */

export function enumerateMonths(fromMonthId: string, toMonthId: string): string[] {
  const out: string[] = [];
  const [yF, mF] = fromMonthId.split("-").map(Number);
  const [yT, mT] = toMonthId.split("-").map(Number);
  let y = yF, m = mF;
  while (y < yT || (y === yT && m <= mT)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m === 13) { m = 1; y++; }
    if (out.length > 240) break; // safety: 20 años
  }
  return out;
}

export function isValidMonthId(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/**
 * Agrega varios meses. Asume que `movements` y `accruals` cubren todo el rango.
 * `assumptionsByMonth` debe tener una entrada por mes (mergea _default + override).
 */
export function aggregateMonths(
  fromMonthId: string,
  toMonthId: string,
  movements: AggregatorMovement[],
  accruals: AggregatorAccrual[],
  assumptionsByMonth: Record<string, TreasuryAssumptions>
): MonthlySnapshot[] {
  const months = enumerateMonths(fromMonthId, toMonthId);
  return months.map((monthId) =>
    aggregateMonth({
      monthId,
      movements,
      accruals,
      assumptions: assumptionsByMonth[monthId] ?? assumptionsByMonth._default,
    })
  );
}
