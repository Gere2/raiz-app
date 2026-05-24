/**
 * scripts/treasury-validate-monthly.mjs
 *
 * Valida PR3 contra datos reales de Firestore. Lee bank_movements +
 * treasury_assumptions + treasury_accruals (si existen) y corre el
 * agregador para los meses pedidos. Imprime tabla resumen + warnings.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-validate-monthly.mjs raiz_y_grano 2026-01 2026-04
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  aggregateMonths,
  enumerateMonths,
} from "../lib/treasury/monthly-aggregator.ts";
import { DEFAULT_ASSUMPTIONS } from "../lib/treasury/seed-accounts.ts";

const here = dirname(fileURLToPath(import.meta.url));
try {
  const txt = readFileSync(resolve(here, "../.env.local"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
if (!getApps().length) {
  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) initializeApp({ credential: cert(JSON.parse(json)) });
  else initializeApp({ credential: applicationDefault() });
}

const [orgId, fromMonth, toMonth] = process.argv.slice(2);
if (!orgId || !fromMonth || !toMonth) {
  console.error("Uso: jiti scripts/treasury-validate-monthly.mjs <orgId> <YYYY-MM> <YYYY-MM>");
  process.exit(2);
}

const db = getFirestore();

console.log(`\nAggregador mensual · orgs/${orgId} · ${fromMonth} → ${toMonth}`);
console.log("═".repeat(80));

/* ─── Carga datos ──────────────────────────────────────────── */
const monthIds = enumerateMonths(fromMonth, toMonth);
const fromDate = `${fromMonth}-01`;
const [yT, mT] = toMonth.split("-").map(Number);
const lastDay = new Date(Date.UTC(yT, mT, 0)).getUTCDate();
const toDate = `${toMonth}-${String(lastDay).padStart(2, "0")}`;

const movSnap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("date", ">=", fromDate)
  .where("date", "<=", toDate)
  .get();

const movements = movSnap.docs.map((d) => {
  const x = d.data();
  return {
    id: d.id,
    date: String(x.date ?? ""),
    amount: Number(x.amount) || 0,
    concept: x.concept ?? null,
    category: x.category ?? null,
    subcategory: x.subcategory ?? null,
    flowKind: x.flowKind ?? null,
    classifierSource: x.classifierSource ?? null,
    cashMonth: x.cashMonth ?? null,
    economicMonth: x.economicMonth ?? null,
    accountId: x.accountId ?? null,
  };
});
console.log(`Movimientos cargados: ${movements.length}`);

/* ─── Assumptions ──────────────────────────────────────────── */
const assumptionsByMonth = { _default: { ...DEFAULT_ASSUMPTIONS } };
const defDoc = await db.collection("orgs").doc(orgId)
  .collection("treasury_assumptions").doc("_default").get();
if (defDoc.exists) assumptionsByMonth._default = { ...assumptionsByMonth._default, ...defDoc.data() };

for (const mid of monthIds) {
  const overrideDoc = await db.collection("orgs").doc(orgId)
    .collection("treasury_assumptions").doc(mid).get();
  assumptionsByMonth[mid] = overrideDoc.exists
    ? { ...assumptionsByMonth._default, ...overrideDoc.data() }
    : assumptionsByMonth._default;
}

/* ─── Accruals (PR4 los rellenará; PR3 vacíos) ─────────────── */
let accruals = [];
try {
  const accSnap = await db.collection("orgs").doc(orgId)
    .collection("treasury_accruals")
    .where("economicMonth", "in", monthIds.slice(0, 30))
    .get();
  accruals = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
} catch {}
console.log(`Accruals cargados: ${accruals.length}`);
console.log(`Sueldo fundador imputado:`);
console.log(`  default:  ${assumptionsByMonth._default.foundersSalary} €/mes`);
for (const m of monthIds) {
  const override = assumptionsByMonth[m]?.foundersSalary;
  if (override !== undefined && override !== assumptionsByMonth._default.foundersSalary) {
    console.log(`  ${m}:  ${override} €/mes  (override)`);
  }
}

/* ─── Run aggregator ───────────────────────────────────────── */
const snapshots = aggregateMonths(fromMonth, toMonth, movements, accruals, assumptionsByMonth);

/* ─── Tabla resumen ───────────────────────────────────────── */
const f = (n) => Number(n).toFixed(2).padStart(10);
const pct = (n) => (Number(n) * 100).toFixed(1).padStart(6) + "%";

console.log("\nResumen CASH por mes");
console.log("─".repeat(80));
const header = "Mes        |  Ventas TPV |  Gtos Op   |   AEAT   |    SS    |   Card   |  Socio   |  Result.Caja  | FC%";
console.log(header);
console.log("─".repeat(header.length));
for (const s of snapshots) {
  console.log(
    s.monthId.padEnd(11) + "|" +
    f(s.cash.ventasTpv.total) + " |" +
    f(s.cash.gastosOperativosTotales) + " |" +
    f(s.cash.impuestosAEAT.total) + " |" +
    f(s.cash.seguridadSocial.total) + " |" +
    f(s.cash.tarjetaPendiente.total) + " |" +
    f(s.cash.disposicionSocio.total) + " |" +
    f(s.cash.resultadoCaja).padStart(13) + " | " +
    pct(s.foodCost.foodCostPagado / 100 * 100 / 100) // foodCost.foodCostPagado ya es ratio
  );
}

console.log("\nResumen ECONÓMICO por mes (incluye sueldo fundador imputado)");
console.log("─".repeat(80));
const eHeader = "Mes        | Ingresos | Gastos Op | AEAT+SS  |  Sueldo  |  Result.Econ. (con sueldo fundador)";
console.log(eHeader);
console.log("─".repeat(eHeader.length));
for (const s of snapshots) {
  const aeatSs = s.economic.impuestosAEAT.total + s.economic.seguridadSocial.total;
  console.log(
    s.monthId.padEnd(11) + "|" +
    f(s.economic.ingresosTotales) + " |" +
    f(s.economic.gastosOperativosTotales) + " |" +
    f(aeatSs) + " |" +
    f(-s.economic.sueldoFundadorImputado) + " | " +
    f(s.economic.resultadoEconomicoConSueldoFundador)
  );
}

/* ─── Warnings ─────────────────────────────────────────────── */
console.log("\nWARNINGS por mes");
console.log("─".repeat(80));
let totalWarns = 0;
for (const s of snapshots) {
  if (s.warnings.length === 0) {
    console.log(`  ${s.monthId}: sin warnings`);
    continue;
  }
  console.log(`\n  ${s.monthId} (${s.warnings.length}):`);
  for (const w of s.warnings) {
    totalWarns++;
    const icon = w.severity === "danger" ? "🔴" : w.severity === "warn" ? "🟡" : "🔵";
    console.log(`    ${icon} [${w.code}] ${w.message}`);
  }
}

/* ─── Detalle de un mes (el último con datos) ──────────────── */
const detalleMes = [...snapshots].reverse().find((s) => s.totalMovements > 0) ?? snapshots[0];
console.log(`\n\nDetalle completo de ${detalleMes.monthId}`);
console.log("═".repeat(80));
console.log("CASH");
console.log("─".repeat(40));
const cashRows = [
  ["Ventas TPV", detalleMes.cash.ventasTpv],
  ["Ingresos otros", detalleMes.cash.ingresosOtros],
  ["Coste prod. pagado", detalleMes.cash.costeProductoPagado],
  ["Suministros", detalleMes.cash.suministros],
  ["Tecnología", detalleMes.cash.tecnologia],
  ["Gestoría", detalleMes.cash.gestoria],
  ["Transporte", detalleMes.cash.transporte],
  ["Personal pagado", detalleMes.cash.personalPagado],
  ["Otros gastos", detalleMes.cash.otrosGastos],
  ["AEAT", detalleMes.cash.impuestosAEAT],
  ["Seguridad Social", detalleMes.cash.seguridadSocial],
  ["Tarjeta pendiente", detalleMes.cash.tarjetaPendiente],
  ["Disposición socio", detalleMes.cash.disposicionSocio],
  ["Traspasos internos", detalleMes.cash.traspasosInternos],
  ["Sin clasificar", detalleMes.cash.sinClasificar],
];
for (const [name, b] of cashRows) {
  if (b.count === 0) continue;
  console.log(`  ${name.padEnd(22)} ${f(b.total)} €  (${b.count} mov)`);
}
console.log(`  ${"─".repeat(22)}`);
console.log(`  ${"Resultado operativo".padEnd(22)} ${f(detalleMes.cash.resultadoOperativoCaja)} €`);
console.log(`  ${"Resultado caja".padEnd(22)} ${f(detalleMes.cash.resultadoCaja)} €`);
console.log(`  ${"Volumen total abs".padEnd(22)} ${f(detalleMes.cash.volumenAbsolutoTotal)} €`);
console.log(`  ${"% sin clasificar".padEnd(22)} ${(detalleMes.cash.pctSinClasificar * 100).toFixed(2)}%`);

console.log("\nFOOD COST");
console.log(`  Pagado:     ${detalleMes.foodCost.foodCostPagadoPct}%`);
console.log(`  Target:     ${(detalleMes.foodCost.target * 100).toFixed(0)}%`);
console.log(`  Alerta:     ${(detalleMes.foodCost.alerta * 100).toFixed(0)}%`);
console.log(`  Estado:     ${detalleMes.foodCost.estado}`);

console.log("\nECONÓMICO");
console.log(`  Resultado op. antes impuestos:        ${f(detalleMes.economic.resultadoOperativoAntesImpuestos)} €`);
console.log(`  Resultado econ. antes sueldo Geremi:  ${f(detalleMes.economic.resultadoEconomicoAntesSueldoFundador)} €`);
console.log(`  Sueldo fundador imputado:             ${f(-detalleMes.economic.sueldoFundadorImputado)} €`);
console.log(`  Resultado econ. con sueldo Geremi:    ${f(detalleMes.economic.resultadoEconomicoConSueldoFundador)} €`);

/* ─── Semáforo + sueldo posible + escenarios (PR5) ────────── */
console.log("\nSEMÁFORO Y SUELDO POSIBLE");
console.log("─".repeat(40));
const sem = detalleMes.semaforo;
const ps = detalleMes.possibleSalary;
const semIcon = sem ? (sem.estado === "verde" ? "🟢" : sem.estado === "amarillo" ? "🟡" : "🔴") : "⚪";
if (sem) {
  console.log(`  ${semIcon} Estado: ${sem.estado.toUpperCase()}  (sueldo aplicado: ${sem.salaryUsed} €)`);
  console.log(`     ${sem.reason}`);
}
if (ps) {
  console.log(`\n  Sueldo Geremi posible este mes:`);
  console.log(`    Máx por caja:           ${f(ps.sueldoMaximoCaja)} €`);
  console.log(`    Máx por económico:      ${f(ps.sueldoMaximoEconomico)} €`);
  console.log(`    Máx (el más restrictivo): ${f(ps.sueldoMaximo)} €`);
  console.log(`    Recomendado prudente:   ${f(ps.sueldoRecomendadoPrudente)} €`);
  console.log(`\n  Sueldo objetivo:        ${f(ps.sueldoObjetivo)} €`);
  console.log(`  Gap:                    ${f(ps.gap)} €  ${ps.gap > 0 ? "(falta)" : "(cubre)"}`);
  if (ps.gap > 0) {
    console.log(`  Ventas extra requeridas: ${f(ps.ventasExtraMesEur)} €/mes`);
    console.log(`  Tickets extra:           ${ps.ticketsExtraMes}/mes  (~${ps.ticketsExtraDia}/día)`);
    console.log(`     a ${ps.inputs.avgTicket} €/ticket, margen bruto ${(ps.inputs.grossMarginRatio * 100).toFixed(0)}%, ${ps.inputs.operatingDaysPerMonth} días operativos/mes`);
  }
}

/* ─── Tabla escenarios sueldo Geremi por todos los meses ──── */
console.log("\nTABLA ESCENARIOS SUELDO GEREMI (por mes)");
console.log("─".repeat(80));
const salaries = detalleMes.scenarios?.map((s) => s.salary) ?? [0, 500, 1000, 1500, 2000];
const scenarioHeader = "Mes        | " + salaries.map((s) => `${String(s).padStart(5)} €`).join(" | ");
console.log(scenarioHeader);
console.log("─".repeat(scenarioHeader.length));
for (const s of snapshots) {
  if (!s.scenarios) {
    console.log(`${s.monthId}    | (sin movimientos)`);
    continue;
  }
  const row = `${s.monthId}    | ` +
    s.scenarios.map((sc) => {
      const icon = sc.semaforo === "verde" ? "🟢" : sc.semaforo === "amarillo" ? "🟡" : "🔴";
      return `${icon} ${f(sc.cashWithSalary).padStart(7)}`;
    }).join(" | ");
  console.log(row);
}
console.log("─".repeat(scenarioHeader.length));
console.log("(números = caja restante con ese sueldo. 🟢 verde / 🟡 amarillo / 🔴 rojo)");

console.log(`\n${totalWarns} warnings totales en el rango.`);
console.log("─".repeat(80));
console.log("Para escribir snapshots en Firestore (cache opt-in):");
console.log(`  curl ".../api/org/${orgId}/treasury/monthly?from=${fromMonth}&to=${toMonth}&writeCache=true"`);
console.log("─".repeat(80));
process.exit(0);
