/**
 * Smoke runnable de PR2 sin Vitest (mismo motivo que classify.smoke.mjs).
 *   ./node_modules/.bin/jiti __tests__/treasury/transfer-detector.smoke.mjs
 */

import { detectTransfers, hasTransferHint, dateDeltaDays }
  from "../../lib/treasury/transfer-detector.ts";

let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); if (detail) console.log("      " + JSON.stringify(detail)); }
};
const M = (o) => ({
  id: o.id ?? "x", date: o.date ?? "2026-04-01", amount: o.amount ?? 0,
  concept: o.concept ?? "", accountId: o.accountId ?? "santander_main",
  bank: o.bank ?? "santander", flowKind: o.flowKind ?? null,
  classifierSource: o.classifierSource ?? null,
  pairedTransferId: o.pairedTransferId ?? null,
});

console.log("\nhasTransferHint");
check("Santander traspaso → true", hasTransferHint("Santander traspaso") === true);
check("TRANSFERENCIA RECIBIDA BBVA → true", hasTransferHint("TRANSFERENCIA RECIBIDA BBVA") === true);
check("AMAZON EU SARL → false", hasTransferHint("AMAZON EU SARL") === false);

console.log("\ndateDeltaDays");
check("2026-04-10 - 2026-04-08 = 2", dateDeltaDays("2026-04-10", "2026-04-08") === 2);
check("2026-04-08 - 2026-04-10 = -2", dateDeltaDays("2026-04-08", "2026-04-10") === -2);
check("misma fecha = 0", dateDeltaDays("2026-04-10", "2026-04-10") === 0);

console.log("\ndetectTransfers — strong pairs");
{
  const r = detectTransfers([
    M({ id: "a", date: "2026-03-27", amount: -2700, accountId: "santander_main", bank: "santander", concept: "Santander traspaso" }),
    M({ id: "b", date: "2026-03-27", amount: 2700, accountId: "bbva_main", bank: "bbva", concept: "Transferencia recibida" }),
  ]);
  check("par claro mismo día → 1 strong, 0 ambiguous",
    r.strongPairs.length === 1 && r.ambiguous.length === 0, r);
  check("subcategory santander_bbva", r.strongPairs[0]?.subcategory === "santander_bbva", r.strongPairs[0]);
  check("hintSource = both", r.strongPairs[0]?.hintSource === "both");
  check("confidence = 0.95", r.strongPairs[0]?.confidence === 0.95);
}
{
  const r = detectTransfers([
    M({ id: "out", date: "2026-04-08", amount: -1000, accountId: "santander_main", bank: "santander", concept: "Traspaso a BBVA" }),
    M({ id: "in", date: "2026-04-10", amount: 1000, accountId: "bbva_main", bank: "bbva", concept: "" }),
  ]);
  check("par con 2 días dentro de ventana → strong",
    r.strongPairs.length === 1 && r.strongPairs[0].dateDeltaDays === 2);
  check("hintSource = out (sólo el negativo tiene hint)",
    r.strongPairs[0]?.hintSource === "out");
}
{
  const r = detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -500, accountId: "bbva_main", bank: "bbva", concept: "Transferencia a Santander" }),
    M({ id: "b", date: "2026-04-01", amount: 500, accountId: "santander_main", bank: "santander", concept: "" }),
  ]);
  check("BBVA out → Santander in genera bbva_santander",
    r.strongPairs[0]?.subcategory === "bbva_santander", r.strongPairs[0]);
}
{
  const r = detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100.005, accountId: "santander_main", concept: "Traspaso" }),
    M({ id: "b", date: "2026-04-01", amount: 100.005, accountId: "bbva_main", concept: "" }),
  ]);
  check("tolerancia ±0,01 € permite redondeos", r.strongPairs.length === 1, r);
}

console.log("\ndetectTransfers — sin match");
check("importes distintos → no pair",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-01", amount: 99, accountId: "bbva_main" }),
  ]).strongPairs.length === 0);

check("misma cuenta → no pair",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-01", amount: 100, accountId: "santander_main", concept: "Devolución" }),
  ]).strongPairs.length === 0);

check("fuera de ventana → no pair",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso BBVA", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-10", amount: 100, accountId: "bbva_main" }),
  ], { windowDays: 3 }).strongPairs.length === 0);

check("sin hint en ningún concepto → no pair",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Pago proveedor X", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-01", amount: 100, concept: "Cobro factura", accountId: "bbva_main" }),
  ]).strongPairs.length === 0);

check("windowDays=0 fuerza misma fecha (1 día fuera)",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-02", amount: 100, accountId: "bbva_main" }),
  ], { windowDays: 0 }).strongPairs.length === 0);

check("windowDays=0 misma fecha → strong",
  detectTransfers([
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main" }),
  ], { windowDays: 0 }).strongPairs.length === 1);

console.log("\ndetectTransfers — ambiguos");
{
  const r = detectTransfers([
    M({ id: "neg", date: "2026-04-01", amount: -200, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "pos1", date: "2026-04-01", amount: 200, accountId: "bbva_main" }),
    M({ id: "pos2", date: "2026-04-02", amount: 200, accountId: "bbva_main" }),
  ]);
  check("dos positivos compatibles con un negativo → ambiguo",
    r.strongPairs.length === 0 && r.ambiguous.length === 1
    && r.ambiguous[0].movementIds.sort().join(",") === "neg,pos1,pos2", r);
}
{
  const r = detectTransfers([
    M({ id: "neg1", date: "2026-04-01", amount: -300, concept: "Traspaso", accountId: "santander_main" }),
    M({ id: "neg2", date: "2026-04-01", amount: -300, concept: "Transferencia", accountId: "santander_main" }),
    M({ id: "pos", date: "2026-04-01", amount: 300, accountId: "bbva_main" }),
  ]);
  check("dos negativos por un positivo → ambiguo",
    r.strongPairs.length === 0 && r.ambiguous.length === 1
    && r.ambiguous[0].movementIds.sort().join(",") === "neg1,neg2,pos", r);
}

console.log("\ndetectTransfers — idempotencia / manual");
{
  const movs = [
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", accountId: "santander_main", flowKind: "internal_transfer", pairedTransferId: "b" }),
    M({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main", flowKind: "internal_transfer", pairedTransferId: "a" }),
  ];
  check("ya emparejado → skip", detectTransfers(movs).strongPairs.length === 0);
  check("ya emparejado + force → re-empareja", detectTransfers(movs, { force: true }).strongPairs.length === 1);
}
{
  const movs = [
    M({ id: "a", date: "2026-04-01", amount: -100, concept: "Traspaso", classifierSource: "manual", accountId: "santander_main" }),
    M({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main" }),
  ];
  check("classifierSource=manual → skip", detectTransfers(movs).strongPairs.length === 0);
  check("manual + force → empareja", detectTransfers(movs, { force: true }).strongPairs.length === 1);
}

console.log(`\n${passed} pass · ${failed} fail`);
process.exit(failed > 0 ? 1 : 0);
