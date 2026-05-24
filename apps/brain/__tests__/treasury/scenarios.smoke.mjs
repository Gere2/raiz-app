/**
 * Smoke tests del semáforo + sueldo posible (PR5).
 *   ./node_modules/.bin/jiti __tests__/treasury/scenarios.smoke.mjs
 */

import {
  computeSemaforo,
  computePossibleSalary,
  computeSalaryScenarios,
  enrichSnapshot,
} from "../../lib/treasury/scenarios.ts";
import { DEFAULT_ASSUMPTIONS } from "../../lib/treasury/seed-accounts.ts";

let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); if (detail) console.log("      " + JSON.stringify(detail)); }
};

// Snapshot mínimo — solo necesita los dos resultados base
const mockSnapshot = (cash, econ) => ({
  monthId: "2026-04",
  computedAt: "2026-04-30T00:00:00Z",
  scenarioHash: "x",
  totalMovements: 100,
  cash: { resultadoCaja: cash, ventasTpv: { total: 8725 } },
  economic: { resultadoEconomicoAntesSueldoFundador: econ },
});

console.log("\ncomputeSemaforo");

{
  // Verde: cash positivo, económico positivo con sueldo
  const r = computeSemaforo(mockSnapshot(2000, 2500), 1000);
  check("cash 2000 / econ 2500 - sueldo 1000 → verde",
    r.estado === "verde" && r.cashWithSalary === 1000 && r.economicWithSalary === 1500, r);
}
{
  // Amarillo: cash ok pero económico < 0
  const r = computeSemaforo(mockSnapshot(1500, 800), 1000);
  check("cash 1500 ok, econ 800-1000=-200 → amarillo",
    r.estado === "amarillo" && r.cashWithSalary === 500 && r.economicWithSalary === -200, r);
}
{
  // Rojo: cash negativo
  const r = computeSemaforo(mockSnapshot(-500, 1500), 1000);
  check("cash -500 → rojo", r.estado === "rojo", r);
}
{
  // Tolerancia: cash exactamente 0 → verde si econ ok
  const r = computeSemaforo(mockSnapshot(1000, 1000), 1000);
  check("cash exactamente 0 con econ 0 → verde (tolerancia)",
    r.estado === "verde" && r.cashWithSalary === 0, r);
}

console.log("\ncomputePossibleSalary");

{
  // Negocio holgado
  const r = computePossibleSalary(mockSnapshot(3000, 4000), DEFAULT_ASSUMPTIONS);
  check("cash 3000 / econ 4000 → max=3000 (limitado por caja)",
    r.sueldoMaximoCaja === 3000 && r.sueldoMaximoEconomico === 4000 && r.sueldoMaximo === 3000, r);
  check("recomendado prudente = 70% del max",
    Math.abs(r.sueldoRecomendadoPrudente - 2100) < 0.01, r);
}
{
  // Negocio apretado: gap a sueldo objetivo 2000
  const r = computePossibleSalary(mockSnapshot(1500, 1800), { ...DEFAULT_ASSUMPTIONS, foundersSalaryTarget: 2000 });
  check("max=1500, objetivo 2000 → gap = 500",
    r.gap === 500 && r.sueldoMaximo === 1500, r);
  check("ventas extra = gap / 0.7 ≈ 714 €",
    Math.abs(r.ventasExtraMesEur - 714.29) < 0.5, r);
  check("tickets extra mes = ceil(714 / 3.5) = 205",
    r.ticketsExtraMes === 205, r);
  check("tickets extra día = ceil(205 / 22) = 10",
    r.ticketsExtraDia === 10, r);
}
{
  // Negocio en pérdidas: max = 0
  const r = computePossibleSalary(mockSnapshot(-200, -100), DEFAULT_ASSUMPTIONS);
  check("cash y econ negativos → sueldoMaximo = 0",
    r.sueldoMaximo === 0, r);
  check("gap a objetivo 1000 = 1000",
    r.gap === 1000, r);
}
{
  // Sueldo objetivo override por argumento
  const r = computePossibleSalary(mockSnapshot(1500, 2000), DEFAULT_ASSUMPTIONS, 1500);
  check("override de sueldoObjetivo via parámetro",
    r.sueldoObjetivo === 1500 && r.gap === 0, r);
}

console.log("\ncomputeSalaryScenarios — escenario tabla");

{
  // Abril real: cash +1748, econ antes sueldo +2917
  const snapshot = mockSnapshot(1748.42, 2917.46);
  const scenarios = computeSalaryScenarios(snapshot);

  // Sueldo 0 → verde
  check("sueldo 0 → verde", scenarios[0].semaforo === "verde");
  check("sueldo 0 → cash 1748", scenarios[0].cashWithSalary === 1748.42);
  // Sueldo 500 → verde
  check("sueldo 500 → verde", scenarios[1].semaforo === "verde");
  // Sueldo 1000 → verde (cash 748, econ 1917)
  check("sueldo 1000 → verde",
    scenarios[2].semaforo === "verde" && scenarios[2].cashWithSalary === 748.42, scenarios[2]);
  // Sueldo 1500 → verde (cash 248, econ 1417)
  check("sueldo 1500 → verde",
    scenarios[3].semaforo === "verde" && scenarios[3].cashWithSalary === 248.42, scenarios[3]);
  // Sueldo 2000 → ROJO (cash -252)
  check("sueldo 2000 → rojo (cash -252)",
    scenarios[4].semaforo === "rojo" && scenarios[4].cashWithSalary === -251.58, scenarios[4]);
}

console.log("\nenrichSnapshot — wrapper completo");

{
  const enrichment = enrichSnapshot(
    mockSnapshot(2000, 3000),
    { ...DEFAULT_ASSUMPTIONS, foundersSalary: 1000, foundersSalaryTarget: 1500 }
  );
  check("semaforo principal usa foundersSalary", enrichment.semaforo.salaryUsed === 1000);
  check("scenarios siempre tiene 5 (default)", enrichment.scenarios.length === 5);
  check("possibleSalary usa salaryTarget", enrichment.possibleSalary.sueldoObjetivo === 1500);
}

console.log(`\n${passed} pass · ${failed} fail`);
process.exit(failed > 0 ? 1 : 0);
