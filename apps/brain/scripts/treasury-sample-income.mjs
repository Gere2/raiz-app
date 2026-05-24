/**
 * scripts/treasury-sample-income.mjs
 *
 * Imprime hasta 30 movimientos con amount > 0 ordenados por importe descendente.
 * Útil para entender el formato de concepto de las liquidaciones TPV reales.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-sample-income.mjs raiz_y_grano 2026-01-01 2026-04-30
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const [orgId, dateFrom, dateTo] = process.argv.slice(2);
if (!orgId || !dateFrom || !dateTo) {
  console.error("Uso: jiti scripts/treasury-sample-income.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD>");
  process.exit(2);
}

const db = getFirestore();
const snap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("date", ">=", dateFrom)
  .where("date", "<=", dateTo)
  .get();

const incomes = snap.docs
  .map((d) => d.data())
  .filter((m) => Number(m.amount) > 0)
  .sort((a, b) => Number(b.amount) - Number(a.amount));

console.log(`\n${incomes.length} ingresos en el rango (ordenados por importe desc)\n`);
console.log("─".repeat(78));
const sample = incomes.slice(0, 30);
for (const m of sample) {
  console.log(
    `${m.date}  ${Number(m.amount).toFixed(2).padStart(10)} €  ${m.bank ?? "?"}  ← ${m.concept}`
  );
}
if (incomes.length > 30) {
  console.log(`\n... y ${incomes.length - 30} ingresos más.`);
}
process.exit(0);
