/**
 * scripts/treasury-dedupe-tpv.mjs
 *
 * Resuelve la duplicación de TPV entre Santander y BBVA cuando el datáfono
 * ha pasado por una transición:
 *
 *   ANTES del cambio: datáfono → BBVA directo (LIQUIDACION REMESA DE COMERCIOS)
 *   DESPUÉS del cambio: datáfono → Santander → barrido automático a BBVA
 *                       (Santander aparece como "Liquidacion Efectuada"
 *                        Y BBVA aparece como "LIQUIDACION REMESA DE COMERCIOS"
 *                        con MISMO IMPORTE — duplicado).
 *
 * Algoritmo:
 *   1. Carga todos los movimientos con flowKind = "income_sales_tpv".
 *   2. Bucket por importe absoluto (céntimos).
 *   3. Para cada bucket con Santander+BBVA: empareja por fecha más cercana
 *      en ventana ±N días (default 3).
 *   4. Marca el BBVA como internal_transfer / traspaso_interno con
 *      pairedTransferId apuntando al Santander.
 *   5. El Santander queda intacto como venta TPV real.
 *
 * Si hay BBVA sin contrapartida Santander (periodo BBVA-only previo al
 * cambio): se queda como income_sales_tpv. Sin tocar.
 *
 * Uso:
 *   ./node_modules/.bin/jiti scripts/treasury-dedupe-tpv.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD> [--apply] [--windowDays=3]
 *
 * Por defecto es DRY RUN. Añade --apply para escribir.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const here = dirname(fileURLToPath(import.meta.url));
try {
  const txt = readFileSync(resolve(here, "../.env.local"), "utf8");
  for (const l of txt.split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("="); if (eq < 0) continue;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
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
const [orgId, fromDate, toDate] = positional;
const apply = args.includes("--apply");
const windowDays = Number(args.find((a) => a.startsWith("--windowDays="))?.split("=")[1] ?? 3);

if (!orgId || !fromDate || !toDate) {
  console.error("Uso: jiti scripts/treasury-dedupe-tpv.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD> [--apply] [--windowDays=3]");
  process.exit(2);
}

const db = getFirestore();

console.log(`\n${apply ? "APPLY" : "DRY RUN"} dedupe TPV · orgs/${orgId}`);
console.log(`  Rango: ${fromDate} … ${toDate}  (windowDays=${windowDays})`);
console.log("─".repeat(80));

// 1. Carga TODOS los movs del rango (evita índice compuesto) y filtra TPV en memoria
const snap = await db.collection("orgs").doc(orgId).collection("bank_movements")
  .where("date", ">=", fromDate).where("date", "<=", toDate)
  .get();
const allMovs = snap.docs.map((d) => {
  const x = d.data();
  return {
    id: d.id,
    date: String(x.date ?? ""),
    amount: Number(x.amount) || 0,
    concept: x.concept ?? "",
    bank: x.bank ?? null,
    accountId: x.accountId ?? "",
    flowKind: x.flowKind ?? null,
    classifierSource: x.classifierSource ?? null,
  };
});
const tpvs = allMovs.filter((m) => m.flowKind === "income_sales_tpv");
console.log(`Cargados ${allMovs.length} movs en rango · ${tpvs.length} con flowKind=income_sales_tpv`);

// 2. Bucket por importe (céntimos)
const byAmount = new Map();
for (const m of tpvs) {
  const key = Math.round(Math.abs(m.amount) * 100);
  if (!byAmount.has(key)) byAmount.set(key, { santander: [], bbva: [] });
  const bucket = byAmount.get(key);
  if (m.bank === "santander") bucket.santander.push(m);
  else if (m.bank === "bbva") bucket.bbva.push(m);
}

// 3. Empareja por fecha más cercana
const dateDelta = (a, b) => {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const dbu = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - dbu) / 86_400_000);
};

const pairs = [];
const tpvOnlyBbva = [];   // bbva sin pareja santander → se quedan como TPV
const tpvOnlySantander = []; // santander sin pareja bbva → se quedan como TPV

for (const [key, bucket] of byAmount) {
  if (bucket.santander.length === 0 && bucket.bbva.length === 0) continue;
  if (bucket.santander.length === 0) {
    bucket.bbva.forEach((b) => tpvOnlyBbva.push(b));
    continue;
  }
  if (bucket.bbva.length === 0) {
    bucket.santander.forEach((s) => tpvOnlySantander.push(s));
    continue;
  }

  // Greedy matching: para cada santander busca el bbva más cercano en fecha
  const usedBbva = new Set();
  for (const s of bucket.santander) {
    let best = null;
    let bestDelta = Infinity;
    for (const b of bucket.bbva) {
      if (usedBbva.has(b.id)) continue;
      const delta = Math.abs(dateDelta(s.date, b.date));
      if (delta <= windowDays && delta < bestDelta) {
        best = b;
        bestDelta = delta;
      }
    }
    if (best) {
      usedBbva.add(best.id);
      pairs.push({ santander: s, bbva: best, dateDelta: bestDelta, amount: Math.abs(s.amount) });
    } else {
      tpvOnlySantander.push(s);
    }
  }
  // bbvas sobrantes
  for (const b of bucket.bbva) {
    if (!usedBbva.has(b.id)) tpvOnlyBbva.push(b);
  }
}

console.log(`\nPares Santander↔BBVA detectados: ${pairs.length}`);
console.log(`BBVA TPV sin pareja (periodo BBVA-only, se mantienen): ${tpvOnlyBbva.length}`);
console.log(`Santander TPV sin pareja (anomalía): ${tpvOnlySantander.length}`);

// 4. Resumen por mes
const byMonth = {};
for (const p of pairs) {
  const m = p.santander.date.slice(0, 7);
  if (!byMonth[m]) byMonth[m] = { count: 0, total: 0 };
  byMonth[m].count++;
  byMonth[m].total += p.amount;
}
console.log("\nDuplicados por mes (Santander ↔ BBVA):");
for (const [m, v] of Object.entries(byMonth).sort()) {
  console.log(`  ${m}: ${v.count} pares · ${v.total.toFixed(2)} €`);
}

// 5. BBVA TPV-only por mes (las que SE QUEDAN como ventas)
const byMonthOnlyBbva = {};
for (const b of tpvOnlyBbva) {
  const m = b.date.slice(0, 7);
  if (!byMonthOnlyBbva[m]) byMonthOnlyBbva[m] = { count: 0, total: 0 };
  byMonthOnlyBbva[m].count++;
  byMonthOnlyBbva[m].total += Math.abs(b.amount);
}
console.log("\nBBVA TPV-only por mes (periodo pre-cambio, se mantienen como ventas):");
for (const [m, v] of Object.entries(byMonthOnlyBbva).sort()) {
  console.log(`  ${m}: ${v.count} movs · ${v.total.toFixed(2)} €`);
}

if (pairs.length === 0) {
  console.log("\nNo hay nada que de-duplicar.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. Para aplicar:");
  console.log(`  jiti scripts/treasury-dedupe-tpv.mjs ${orgId} ${fromDate} ${toDate} --apply`);
  console.log("\nPrimeros 5 pares:");
  for (const p of pairs.slice(0, 5)) {
    console.log(`  ${p.amount.toFixed(2)} €  Δ${p.dateDelta}d`);
    console.log(`    Santander  ${p.santander.date}  ${p.santander.id}  ← ${p.santander.concept.slice(0, 50)}`);
    console.log(`    BBVA       ${p.bbva.date}  ${p.bbva.id}  ← ${p.bbva.concept.slice(0, 50)}`);
  }
  process.exit(0);
}

// 6. Escribir
const ops = [];
for (const p of pairs) {
  // BBVA → internal_transfer
  ops.push({
    id: p.bbva.id,
    data: {
      flowKind: "internal_transfer",
      category: "traspaso_interno",
      subcategory: "santander_bbva_tpv",
      pairedTransferId: p.santander.id,
      classifierSource: "detector:tpv_duplicate",
      classifierReason: `Duplicado de venta TPV. La venta original está en Santander (${p.santander.id}, ${p.santander.date}) por ${p.amount.toFixed(2)} €. Este movimiento es el barrido automático de Santander→BBVA, no una venta nueva.`,
      confidence: 0.95,
      ruleVersion: 1,
      status: "matched",
      updatedAt: FieldValue.serverTimestamp(),
    },
  });
  // Santander → ya está como income_sales_tpv. Solo le añado pairedTransferId para auditoría.
  ops.push({
    id: p.santander.id,
    data: {
      pairedTransferId: p.bbva.id,
      tpvDuplicateNote: `Tiene barrido a BBVA (${p.bbva.id}) marcado como internal_transfer.`,
      updatedAt: FieldValue.serverTimestamp(),
    },
  });
}

let written = 0;
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
console.log(`\nSiguiente paso: re-validar la vista mensual.`);
console.log(`  jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-05`);
process.exit(0);
