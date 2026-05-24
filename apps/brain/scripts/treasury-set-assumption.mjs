/**
 * scripts/treasury-set-assumption.mjs
 *
 * Crea/actualiza un assumption override por mes (o _default).
 *
 *   ./node_modules/.bin/jiti scripts/treasury-set-assumption.mjs \
 *     <orgId> <monthId|_default> --foundersSalary=2000 --avgTicket=3.5 ...
 *
 * Ejemplos:
 *   # sueldo Geremi 2k SOLO en abril
 *   jiti scripts/treasury-set-assumption.mjs raiz_y_grano 2026-04 --foundersSalary=2000
 *
 *   # cambiar default global a 1500 €
 *   jiti scripts/treasury-set-assumption.mjs raiz_y_grano _default --foundersSalary=1500
 *
 * Campos válidos:
 *   foundersSalary, foundersSalaryTarget, avgTicket, ticketsPerMonth,
 *   operatingDaysPerMonth, foodCostTarget, foodCostUpper,
 *   grossMarginTarget, cashSalesEstimate
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

const ALLOWED = [
  "foundersSalary",
  "foundersSalaryTarget",
  "avgTicket",
  "ticketsPerMonth",
  "operatingDaysPerMonth",
  "foodCostTarget",
  "foodCostUpper",
  "grossMarginTarget",
  "cashSalesEstimate",
];

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [orgId, monthId] = positional;

if (!orgId || !monthId) {
  console.error("Uso: jiti scripts/treasury-set-assumption.mjs <orgId> <YYYY-MM|_default> --foundersSalary=2000 ...");
  process.exit(2);
}
if (monthId !== "_default" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) {
  console.error("monthId inválido. Formato YYYY-MM o '_default'."); process.exit(2);
}

const overrides = {};
for (const a of args) {
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq < 0) continue;
  const key = a.slice(2, eq);
  const val = a.slice(eq + 1);
  if (!ALLOWED.includes(key)) {
    if (key === "notes") overrides.notes = val;
    else console.warn(`(ignorado) flag desconocido: --${key}`);
    continue;
  }
  const num = Number(val);
  if (isNaN(num)) { console.error(`Valor no numérico para --${key}=${val}`); process.exit(2); }
  overrides[key] = num;
}

if (Object.keys(overrides).length === 0) {
  console.error("Sin overrides. Pasa al menos uno con --campo=valor."); process.exit(2);
}

const db = getFirestore();
const ref = db.collection("orgs").doc(orgId).collection("treasury_assumptions").doc(monthId);
const existing = await ref.get();

await ref.set(
  { ...overrides, updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) },
  { merge: true }
);

console.log(`${existing.exists ? "✓ Actualizado" : "✓ Creado"} treasury_assumptions/${monthId}`);
for (const [k, v] of Object.entries(overrides)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`\nVer impacto:`);
console.log(`  jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-04`);
process.exit(0);
