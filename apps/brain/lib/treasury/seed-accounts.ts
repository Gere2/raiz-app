/**
 * lib/treasury/seed-accounts.ts
 *
 * Cuentas semilla y supuestos económicos por defecto.
 *
 * Cuentas:
 *   - santander_main → cuenta de cobro TPV
 *   - bbva_main      → cuenta operativa
 *
 * El rol es editable desde la UI futura (treasury_accounts) sin tocar código.
 *
 * Supuestos por defecto (`treasury_assumptions/_default`):
 *   - sueldo Geremi 1.000 € (escenario realista para forzar lectura honesta)
 *   - ticket medio 3,50 €
 *   - 22 días operativos / mes
 *   - food cost objetivo 30 %, alerta 40 %
 *   - margen bruto objetivo 70 %
 */

import type { TreasuryAccount, TreasuryAssumptions } from "./types";

export const SEED_ACCOUNTS: TreasuryAccount[] = [
  {
    id: "santander_main",
    bank: "santander",
    alias: "Santander (cuenta principal)",
    role: "tpv_collection",
    active: true,
  },
  {
    id: "bbva_main",
    bank: "bbva",
    alias: "BBVA (cuenta principal)",
    role: "operating",
    active: true,
  },
];

export const DEFAULT_ASSUMPTIONS: TreasuryAssumptions = {
  foundersSalary: 1000,
  foundersSalaryTarget: 1000,
  avgTicket: 3.5,
  operatingDaysPerMonth: 22,
  foodCostTarget: 0.3,
  foodCostUpper: 0.4,
  grossMarginTarget: 0.7,
  cashSalesEstimate: 0,
  notes:
    "Defaults globales del Treasury Truth Layer. Sobrescribir por mes en treasury_assumptions/{YYYY-MM}.",
};
