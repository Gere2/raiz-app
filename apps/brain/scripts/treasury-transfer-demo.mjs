/**
 * scripts/treasury-transfer-demo.mjs
 *
 * Demo PR2 — corre el detector contra 3 escenarios sintéticos:
 *   1) Match claro (Santander out / BBVA in mismo día, importe igual).
 *   2) Match ambiguo (1 negativo, 2 positivos compatibles).
 *   3) Sin match (importe único sin contraparte en otra cuenta).
 *
 *   ./node_modules/.bin/jiti scripts/treasury-transfer-demo.mjs
 */

import { detectTransfers } from "../lib/treasury/transfer-detector.ts";

function header(title) {
  console.log("\n" + "─".repeat(78));
  console.log(`  ${title}`);
  console.log("─".repeat(78));
}

function showInputs(movs) {
  console.log("  Inputs:");
  for (const m of movs) {
    const sign = m.amount >= 0 ? "+" : "";
    console.log(
      `    · ${m.id.padEnd(6)} ${m.date}  ${sign}${m.amount.toFixed(2).padStart(9)} €  ${m.accountId.padEnd(18)} ← ${m.concept || "(vacío)"}`
    );
  }
}

function showResult(r) {
  if (r.strongPairs.length > 0) {
    console.log("\n  Strong pairs:");
    for (const p of r.strongPairs) {
      console.log(`    out=${p.outMovementId}  in=${p.inMovementId}  ${p.amount.toFixed(2)} €  Δ${p.dateDeltaDays}d  subcategory=${p.subcategory}  conf=${p.confidence}`);
      console.log(`      reason: ${p.reason}`);
    }
  } else {
    console.log("\n  Strong pairs: (ninguno)");
  }

  if (r.ambiguous.length > 0) {
    console.log("\n  Ambiguos (transfer_candidate):");
    for (const a of r.ambiguous) {
      console.log(`    ids=[${a.movementIds.join(", ")}]  ${a.amount.toFixed(2)} €`);
      console.log(`      reason: ${a.reason}`);
    }
  } else {
    console.log("  Ambiguos: (ninguno)");
  }
}

/* ─── Caso 1: match claro ───────────────────────────────────── */
header("Caso 1 · MATCH CLARO — Santander -2.700 → BBVA +2.700 mismo día");
{
  const movs = [
    { id: "santA", date: "2026-03-27", amount: -2700, accountId: "santander_main", bank: "santander", concept: "Santander traspaso" },
    { id: "bbvaA", date: "2026-03-27", amount: 2700, accountId: "bbva_main", bank: "bbva", concept: "Transferencia recibida" },
    { id: "ctx1", date: "2026-03-26", amount: -45.50, accountId: "bbva_main", bank: "bbva", concept: "Pago Amazon (no es traspaso)" },
  ];
  showInputs(movs);
  const r = detectTransfers(movs);
  showResult(r);
}

/* ─── Caso 2: match ambiguo ─────────────────────────────────── */
header("Caso 2 · MATCH AMBIGUO — Santander -200 con dos posibles +200 en BBVA");
{
  const movs = [
    { id: "neg",   date: "2026-04-10", amount: -200, accountId: "santander_main", bank: "santander", concept: "Traspaso a BBVA" },
    { id: "pos1",  date: "2026-04-10", amount: 200, accountId: "bbva_main", bank: "bbva", concept: "" },
    { id: "pos2",  date: "2026-04-12", amount: 200, accountId: "bbva_main", bank: "bbva", concept: "" },
  ];
  showInputs(movs);
  const r = detectTransfers(movs);
  showResult(r);
}

/* ─── Caso 3: no match ──────────────────────────────────────── */
header("Caso 3 · SIN MATCH — Santander -150 con concepto de traspaso pero sin contraparte");
{
  const movs = [
    { id: "neg",   date: "2026-03-10", amount: -150, accountId: "santander_main", bank: "santander", concept: "Traspaso a BBVA" },
    { id: "ctx1",  date: "2026-03-10", amount: 200, accountId: "bbva_main", bank: "bbva", concept: "Cobro factura" },
    { id: "ctx2",  date: "2026-03-09", amount: -75, accountId: "bbva_main", bank: "bbva", concept: "Compra menor" },
  ];
  showInputs(movs);
  const r = detectTransfers(movs);
  showResult(r);
}

console.log("\n" + "─".repeat(78));
