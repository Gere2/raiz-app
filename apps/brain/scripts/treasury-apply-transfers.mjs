/**
 * scripts/treasury-apply-transfers.mjs
 *
 * Aplica el detector de traspasos PR2 directo contra Firestore (sin servidor,
 * sin token). Equivalente al endpoint /treasury/transfers/detect pero corre
 * desde Node con jiti.
 *
 * Detecta strong pairs y los marca como internal_transfer con pairedTransferId.
 * Marca ambiguous como flags=transfer_candidate.
 *
 * Uso:
 *   ./node_modules/.bin/jiti scripts/treasury-apply-transfers.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD> [--apply] [--force] [--windowDays=3]
 *
 * Por defecto es DRY RUN (lista los pares sin escribir). Añade --apply para escribir.
 *
 * Ejemplos:
 *   # dry run del detector sobre enero-abril
 *   jiti scripts/treasury-apply-transfers.mjs raiz_y_grano 2026-01-01 2026-04-30
 *
 *   # aplica de verdad
 *   jiti scripts/treasury-apply-transfers.mjs raiz_y_grano 2026-01-01 2026-04-30 --apply
 *
 *   # ventana de 5 días
 *   jiti scripts/treasury-apply-transfers.mjs raiz_y_grano 2026-01-01 2026-04-30 --apply --windowDays=5
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { detectTransfers } from "../lib/treasury/transfer-detector.ts";

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

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const orgId = positional[0];
const fromDate = positional[1];
const toDate = positional[2];
const apply = args.includes("--apply");
const force = args.includes("--force");
const windowDays = Number(args.find((a) => a.startsWith("--windowDays="))?.split("=")[1] ?? 3);

if (!orgId || !fromDate || !toDate) {
  console.error("Uso: jiti scripts/treasury-apply-transfers.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD> [--apply] [--force] [--windowDays=3]");
  process.exit(2);
}

const db = getFirestore();

const shiftDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const expandedFrom = shiftDays(fromDate, -windowDays);
const expandedTo = shiftDays(toDate, windowDays);

console.log(`\n${apply ? "APPLY" : "DRY RUN"} detector de traspasos · orgs/${orgId}`);
console.log(`  Rango pedido: ${fromDate} … ${toDate}`);
console.log(`  Rango leído:  ${expandedFrom} … ${expandedTo}  (windowDays=${windowDays}${force ? ", force=true" : ""})`);
console.log("─".repeat(80));

const snap = await db.collection("orgs").doc(orgId).collection("bank_movements")
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
console.log(`Movimientos cargados: ${movements.length}`);

const result = detectTransfers(movements, { windowDays, force });

const inRange = (d) => d >= fromDate && d <= toDate;
const filteredPairs = result.strongPairs.filter((p) => inRange(p.outDate) || inRange(p.inDate));
const idDateMap = new Map(movements.map((m) => [m.id, m.date]));
const filteredAmbiguous = result.ambiguous.filter((a) =>
  a.movementIds.some((id) => { const d = idDateMap.get(id); return d ? inRange(d) : false; })
);

console.log(`\nStrong pairs: ${filteredPairs.length}`);
console.log(`Ambiguous:    ${filteredAmbiguous.length}`);
console.log(`Total updates a escribir: ${filteredPairs.length * 2 + filteredAmbiguous.reduce((s, a) => s + a.movementIds.length, 0)}`);

console.log("\nStrong pairs:");
for (const p of filteredPairs) {
  console.log(`  ${p.amount.toFixed(2).padStart(10)} €  ${p.subcategory.padEnd(22)}  Δ${p.dateDeltaDays}d`);
  console.log(`    OUT  ${p.outDate}  ${p.outAccountId}  id=${p.outMovementId}`);
  console.log(`    IN   ${p.inDate}   ${p.inAccountId}  id=${p.inMovementId}`);
}

if (filteredAmbiguous.length > 0) {
  console.log("\nAmbiguous (se marcarán con flag transfer_candidate, NO se cambia flowKind):");
  for (const a of filteredAmbiguous) {
    console.log(`  ${a.amount.toFixed(2)} €  ·  ${a.movementIds.length} ids: ${a.movementIds.join(", ")}`);
  }
}

if (!apply) {
  console.log("\nDry run. Para aplicar:");
  console.log(`  jiti scripts/treasury-apply-transfers.mjs ${orgId} ${fromDate} ${toDate} --apply`);
  process.exit(0);
}

/* ─── Escribe ──────────────────────────────────────────────── */
let written = 0;
const ops = [];
for (const p of filteredPairs) {
  const common = {
    flowKind: "internal_transfer",
    category: "traspaso_interno",
    subcategory: p.subcategory,
    classifierSource: "detector:internal_transfer",
    classifierReason: p.reason,
    confidence: p.confidence,
    ruleVersion: 1,
    status: "matched",
    updatedAt: FieldValue.serverTimestamp(),
  };
  ops.push({ id: p.outMovementId, data: { ...common, pairedTransferId: p.inMovementId } });
  ops.push({ id: p.inMovementId, data: { ...common, pairedTransferId: p.outMovementId } });
}
for (const a of filteredAmbiguous) {
  for (const id of a.movementIds) {
    ops.push({
      id,
      data: {
        flags: FieldValue.arrayUnion("transfer_candidate"),
        status: "pending",
        transferAmbiguousReason: a.reason,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }
}

for (let i = 0; i < ops.length; i += 400) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 400)) {
    const ref = db.collection("orgs").doc(orgId).collection("bank_movements").doc(op.id);
    batch.update(ref, op.data);
  }
  await batch.commit();
  written += Math.min(400, ops.length - i);
  process.stdout.write(`  Escrito ${written}/${ops.length}\r`);
}
console.log(`\n✓ ${written} movimientos actualizados.`);
console.log("\nSiguiente paso: re-validar la vista mensual:");
console.log(`  jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-04`);
process.exit(0);
