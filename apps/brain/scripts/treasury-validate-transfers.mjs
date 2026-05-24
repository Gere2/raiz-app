/**
 * scripts/treasury-validate-transfers.mjs
 *
 * Valida PR2 (detector de traspasos internos) directo contra Firestore.
 * NO escribe. Lee bank_movements en el rango y corre detectTransfers.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-validate-transfers.mjs raiz_y_grano 2026-01-01 2026-04-30
 *   ./node_modules/.bin/jiti scripts/treasury-validate-transfers.mjs raiz_y_grano 2026-01-01 2026-04-30 5     # windowDays=5
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { detectTransfers } from "../lib/treasury/transfer-detector.ts";

/* ─── env loader ────────────────────────────────────────────── */
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
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS)
    initializeApp({ credential: applicationDefault() });
  else throw new Error("Sin credenciales en .env.local");
}

const [orgId, dateFrom, dateTo, windowDaysArg] = process.argv.slice(2);
if (!orgId || !dateFrom || !dateTo) {
  console.error("Uso: jiti scripts/treasury-validate-transfers.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD> [windowDays=3]");
  process.exit(2);
}
const windowDays = Number(windowDaysArg) || 3;

const db = getFirestore();

/* ─── Carga movimientos en ventana expandida ────────────────── */
const shiftDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const expandedFrom = shiftDays(dateFrom, -windowDays);
const expandedTo = shiftDays(dateTo, windowDays);

console.log(`\nLeyendo bank_movements de orgs/${orgId}`);
console.log(`  Rango pedido: ${dateFrom} … ${dateTo}`);
console.log(`  Rango leído:  ${expandedFrom} … ${expandedTo}  (windowDays=${windowDays})\n`);

const snap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("date", ">=", expandedFrom)
  .where("date", "<=", expandedTo)
  .get();

const movements = snap.docs.map((d) => {
  const x = d.data();
  return {
    id: d.id,
    date: String(x.date ?? ""),
    amount: Number(x.amount) || 0,
    concept: x.concept ?? null,
    accountId: String(x.accountId ?? ""),
    bank: x.bank ?? null,
    flowKind: x.flowKind ?? null,
    classifierSource: x.classifierSource ?? null,
    pairedTransferId: x.pairedTransferId ?? null,
  };
});

console.log(`Cargados ${movements.length} movimientos.\n`);
if (movements.length === 0) process.exit(0);

/* ─── Análisis previo: cuántos sin accountId ────────────────── */
const withoutAccount = movements.filter((m) => !m.accountId).length;
const alreadyPaired = movements.filter(
  (m) => m.flowKind === "internal_transfer" && m.pairedTransferId
).length;
const manualSrc = movements.filter((m) => m.classifierSource === "manual").length;

console.log("Pre-análisis:");
console.log(`  · Sin accountId:      ${withoutAccount}  ${withoutAccount > 0 ? "⚠ ejecuta /reclassify primero para que rellenen accountId" : ""}`);
console.log(`  · Ya marcados internal_transfer: ${alreadyPaired}  (se saltan salvo force)`);
console.log(`  · classifierSource=manual:        ${manualSrc}     (se saltan salvo force)\n`);

/* ─── Run detector ─────────────────────────────────────────── */
const result = detectTransfers(movements, { windowDays });

/* ─── Filtra a pares con al menos un extremo dentro del rango ─ */
const inRange = (date) => date >= dateFrom && date <= dateTo;
const filteredPairs = result.strongPairs.filter(
  (p) => inRange(p.outDate) || inRange(p.inDate)
);

const idDateMap = new Map(movements.map((m) => [m.id, m.date]));
const filteredAmbiguous = result.ambiguous.filter((a) =>
  a.movementIds.some((id) => {
    const d = idDateMap.get(id);
    return d ? inRange(d) : false;
  })
);

/* ─── Reporte ──────────────────────────────────────────────── */
console.log("─".repeat(80));
console.log(`STRONG PAIRS detectados en rango: ${filteredPairs.length}`);
console.log("─".repeat(80));
if (filteredPairs.length === 0) {
  console.log("(ninguno)");
} else {
  let totalEur = 0;
  for (const p of filteredPairs) {
    totalEur += p.amount;
    console.log(`\n  ${p.amount.toFixed(2).padStart(10)} €   subcategory=${p.subcategory}   Δ${p.dateDeltaDays}d   conf=${p.confidence}   hint=${p.hintSource}`);
    console.log(`    OUT  ${p.outDate}  ${p.outAccountId}  id=${p.outMovementId}`);
    console.log(`    IN   ${p.inDate}  ${p.inAccountId}  id=${p.inMovementId}`);
    console.log(`    reason: ${p.reason}`);
  }
  console.log(`\n  Total volumen movido en traspasos internos: ${totalEur.toFixed(2)} €`);

  // Por subcategoría
  const bySub = {};
  for (const p of filteredPairs) {
    if (!bySub[p.subcategory]) bySub[p.subcategory] = { count: 0, total: 0 };
    bySub[p.subcategory].count++;
    bySub[p.subcategory].total += p.amount;
  }
  console.log("\n  Resumen por dirección:");
  for (const [sub, v] of Object.entries(bySub).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${sub.padEnd(22)}  ${v.count} pares · ${v.total.toFixed(2)} €`);
  }
}

console.log("\n" + "─".repeat(80));
console.log(`AMBIGUOUS GROUPS en rango: ${filteredAmbiguous.length}`);
console.log("─".repeat(80));
if (filteredAmbiguous.length === 0) {
  console.log("(ninguno)");
} else {
  for (const a of filteredAmbiguous) {
    console.log(`\n  Importe ${a.amount.toFixed(2)} €  ·  ${a.movementIds.length} movimientos`);
    for (const id of a.movementIds) {
      const m = movements.find((x) => x.id === id);
      if (!m) continue;
      const sign = m.amount >= 0 ? "+" : "";
      console.log(`    ${m.date}  ${sign}${m.amount.toFixed(2).padStart(9)} €  ${m.accountId.padEnd(18)}  id=${m.id}`);
      console.log(`      ← ${m.concept}`);
    }
    console.log(`    reason: ${a.reason}`);
  }
}

console.log("\n" + "─".repeat(80));
console.log("Si los pares son correctos, aplica con:");
console.log(`  curl -X POST .../api/org/${orgId}/treasury/transfers/detect \\`);
console.log(`    -H 'authorization: Bearer <token>' \\`);
console.log(`    -H 'content-type: application/json' \\`);
console.log(`    -d '{"from":"${dateFrom}","to":"${dateTo}","windowDays":${windowDays}}'`);
console.log("─".repeat(80));
process.exit(0);
