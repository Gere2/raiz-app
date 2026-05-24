/**
 * scripts/treasury-delete-statement.mjs
 *
 * Borra un bank_statement y TODOS sus bank_movements asociados.
 * Útil para limpiar uploads fallidos o duplicados.
 *
 * Uso:
 *   ./node_modules/.bin/jiti scripts/treasury-delete-statement.mjs <orgId> <statementId>
 *
 * Por defecto es dry-run. Para borrar de verdad añade --apply.
 *
 * Ejemplo:
 *   ./node_modules/.bin/jiti scripts/treasury-delete-statement.mjs raiz_y_grano c7CpGVBb5xlp
 *   ./node_modules/.bin/jiti scripts/treasury-delete-statement.mjs raiz_y_grano c7CpGVBb5xlp --apply
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
  else initializeApp({ credential: applicationDefault() });
}

const args = process.argv.slice(2);
const orgId = args.find((a) => !a.startsWith("--"));
const statementId = args.filter((a) => !a.startsWith("--"))[1];
const apply = args.includes("--apply");

if (!orgId || !statementId) {
  console.error("Uso: jiti scripts/treasury-delete-statement.mjs <orgId> <statementId> [--apply]");
  process.exit(2);
}

const db = getFirestore();
const stmtRef = db.collection("orgs").doc(orgId).collection("bank_statements").doc(statementId);
const stmtSnap = await stmtRef.get();
if (!stmtSnap.exists) {
  console.error(`❌ Statement ${statementId} no existe en orgs/${orgId}.`);
  process.exit(1);
}

const stmt = stmtSnap.data();
console.log(`\n${apply ? "BORRANDO" : "DRY RUN"} statement de orgs/${orgId}`);
console.log("─".repeat(80));
console.log(`  id:           ${statementId}`);
console.log(`  fileName:     ${stmt.fileName ?? "—"}`);
console.log(`  bank:         ${stmt.bank ?? "—"}`);
console.log(`  accountId:    ${stmt.accountId ?? "—"}`);
console.log(`  totalMovs:    ${stmt.totalMovements ?? "?"}`);
console.log(`  totalIncome:  ${stmt.totalIncome ?? "?"}  €`);
console.log(`  totalExpense: ${stmt.totalExpenses ?? "?"} €`);

const movsSnap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("statementId", "==", statementId)
  .get();
console.log(`\nMovimientos asociados encontrados: ${movsSnap.size}`);

if (movsSnap.size > 0) {
  console.log(`Primeros 5:`);
  for (const d of movsSnap.docs.slice(0, 5)) {
    const x = d.data();
    console.log(`  · ${x.date ?? "null"}  ${(Number(x.amount) || 0).toFixed(2).padStart(10)} €  ${(x.concept ?? "").slice(0, 50)}`);
  }
}

if (!apply) {
  console.log(`\nDry run. Para borrar de verdad reejecuta con --apply.`);
  process.exit(0);
}

// Borra movimientos en chunks
let written = 0;
const docs = movsSnap.docs;
for (let i = 0; i < docs.length; i += 400) {
  const batch = db.batch();
  for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
  await batch.commit();
  written += Math.min(400, docs.length - i);
  process.stdout.write(`  Borrados ${written}/${docs.length}\r`);
}
console.log(`\n✓ ${written} movimientos borrados.`);

// Borra statement
await stmtRef.delete();
console.log(`✓ Statement ${statementId} borrado.`);

// Si la cuenta queda huérfana, ofrece borrarla
if (stmt.accountId) {
  const stillUsed = await db.collection("orgs").doc(orgId)
    .collection("bank_movements")
    .where("accountId", "==", stmt.accountId)
    .limit(1)
    .get();
  if (stillUsed.empty) {
    const accRef = db.collection("orgs").doc(orgId).collection("treasury_accounts").doc(stmt.accountId);
    const accSnap = await accRef.get();
    if (accSnap.exists) {
      await accRef.delete();
      console.log(`✓ Cuenta huérfana ${stmt.accountId} borrada (ya nadie la usaba).`);
    }
  }
}

console.log("\n" + "─".repeat(80));
process.exit(0);
