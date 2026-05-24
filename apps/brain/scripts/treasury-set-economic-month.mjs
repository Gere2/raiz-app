/**
 * scripts/treasury-set-economic-month.mjs
 *
 * Setea (o limpia) el economicMonth de un movimiento. Útil cuando una
 * nómina pagada en marzo corresponde económicamente a enero, o un gasto
 * pagado por adelantado afecta a otro mes.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-set-economic-month.mjs \
 *     <orgId> <movId> <YYYY-MM | clear>
 *
 * Ejemplos:
 *   # nómina enero pagada en marzo → cae económicamente en enero
 *   jiti scripts/treasury-set-economic-month.mjs raiz_y_grano abc123 2026-01
 *
 *   # quita el override (vuelve a usar cashMonth)
 *   jiti scripts/treasury-set-economic-month.mjs raiz_y_grano abc123 clear
 *
 * Marca classifierSource = "manual" para que reclassify NO la pise.
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

const [orgId, movId, monthArg] = process.argv.slice(2);
if (!orgId || !movId || !monthArg) {
  console.error("Uso: jiti scripts/treasury-set-economic-month.mjs <orgId> <movId> <YYYY-MM | clear>");
  process.exit(2);
}

const economicMonth =
  monthArg === "clear" || monthArg === "null" ? null : monthArg;
if (economicMonth !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(economicMonth)) {
  console.error("Mes inválido. Usa YYYY-MM o 'clear'."); process.exit(2);
}

const db = getFirestore();
const ref = db.collection("orgs").doc(orgId).collection("bank_movements").doc(movId);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`❌ Movimiento ${movId} no existe.`);
  process.exit(1);
}
const m = snap.data();
console.log(`Movimiento:`);
console.log(`  date:       ${m.date}`);
console.log(`  amount:     ${m.amount}`);
console.log(`  concept:    ${(m.concept || "").slice(0, 60)}`);
console.log(`  cashMonth:  ${m.cashMonth ?? "(derivado de date)"}`);
console.log(`  econ. ANTES: ${m.economicMonth ?? "(== cashMonth)"}`);

await ref.update({
  economicMonth,
  classifierSource: "manual",
  classifierReason: `Mes económico ajustado manualmente a ${economicMonth ?? "(default cashMonth)"}`,
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`  econ. DESPUÉS: ${economicMonth ?? "(default cashMonth)"}`);
console.log(`\n✓ Movimiento actualizado y marcado como manual (no se pisará en reclassify).`);
console.log(`\nVer impacto en el agregador:`);
console.log(`  jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-04`);
process.exit(0);
