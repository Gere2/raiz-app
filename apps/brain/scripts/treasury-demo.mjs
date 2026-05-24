/**
 * scripts/treasury-demo.mjs
 *
 * Ejecuta el classifier sobre 5 movimientos representativos de un extracto
 * BBVA / Santander típico de Raíz y Grano. Sirve como smoke + demo PR1.
 *
 *   cd apps/brain && ./node_modules/.bin/jiti scripts/treasury-demo.mjs
 */

import { classifyMovement, deriveCashMonth, classificationToLegacyStatus }
  from "../lib/treasury/classify.ts";
import { SEED_RULES } from "../lib/treasury/seed-rules.ts";
import { normalizeBank, buildAccountId } from "../lib/treasury/account-resolver.ts";

const cases = [
  {
    bankName: "Santander",
    accountLast4: "1234",
    movement: {
      date: "2026-04-15",
      concept: "LIQUIDACION TARJETA REDSYS COMERCIO RAIZ Y GRANO",
      amount: 412.5,
    },
  },
  {
    bankName: "BBVA",
    accountLast4: "5678",
    movement: {
      date: "2026-04-08",
      concept: "TRANSF. AMOR PERFECTO SL FRA 2026/04 PEDIDO CAFE",
      amount: -660,
    },
  },
  {
    bankName: "BBVA",
    accountLast4: "5678",
    movement: {
      date: "2026-04-12",
      concept: "RECIBO FUNDACION FRANCISCO DE VITORIA SUMINISTROS",
      amount: -180.32,
    },
  },
  {
    bankName: "BBVA",
    accountLast4: "5678",
    movement: {
      date: "2026-04-22",
      concept: "PAGO TARJETA *9415 LIQUIDACION ABRIL 2026",
      amount: -315.45,
    },
  },
  {
    bankName: "Santander",
    accountLast4: "1234",
    movement: {
      date: "2026-04-28",
      concept: "RETIRADA EFECTIVO CAJERO 4B C. ALCORCON",
      amount: -200,
    },
  },
];

console.log("\n5 movimientos representativos clasificados por reglas deterministas\n");
console.log("─".repeat(80));

for (const c of cases) {
  const bank = normalizeBank(c.bankName);
  const accountId = buildAccountId(bank, c.accountLast4);
  const cashMonth = deriveCashMonth(c.movement.date);
  const cls = classifyMovement(
    { concept: c.movement.concept, supplierName: null, amount: c.movement.amount },
    SEED_RULES
  );
  const status = classificationToLegacyStatus(cls);

  console.log(`\n  fecha:        ${c.movement.date}`);
  console.log(`  concepto:     ${c.movement.concept}`);
  console.log(`  importe:      ${c.movement.amount.toFixed(2)} €`);
  console.log(`  bank:         ${bank}`);
  console.log(`  accountId:    ${accountId}`);
  console.log(`  cashMonth:    ${cashMonth}`);
  console.log(`  category:     ${cls.category}`);
  console.log(`  subcategory:  ${cls.subcategory ?? "—"}`);
  console.log(`  flowKind:     ${cls.flowKind}`);
  console.log(`  supplier:     ${cls.supplierName ?? "—"}`);
  console.log(`  confidence:   ${cls.confidence}`);
  console.log(`  source:       ${cls.classifierSource} (v${cls.ruleVersion ?? "—"})`);
  console.log(`  reason:       ${cls.classifierReason}`);
  console.log(`  legacy stat:  ${status}`);
}

console.log("\n" + "─".repeat(80));
