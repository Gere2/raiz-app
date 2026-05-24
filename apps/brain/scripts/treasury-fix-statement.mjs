/**
 * scripts/treasury-fix-statement.mjs
 *
 * Parche manual de un bank_statement existente: setea bank/bankName/last4
 * y propaga el accountId correcto a todos los bank_movements asociados.
 *
 * Útil cuando un CSV se subió sin metadata (parser CSV no extrae bankName)
 * y los movimientos quedaron en accountId="other_main".
 *
 * Uso:
 *   ./node_modules/.bin/jiti scripts/treasury-fix-statement.mjs <orgId> <statementId> <bank> [last4]
 *
 * Ejemplos:
 *   ./node_modules/.bin/jiti scripts/treasury-fix-statement.mjs raiz_y_grano iusqe9l0_0R3 bbva
 *   ./node_modules/.bin/jiti scripts/treasury-fix-statement.mjs raiz_y_grano iusqe9l0_0R3 santander 1234
 *
 *   bank ∈ {santander, bbva, other}
 *   last4 opcional (4 dígitos del IBAN/cuenta); si se omite → fallback "_main"
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  buildAccountAlias,
  buildAccountId,
  normalizeBank,
} from "../lib/treasury/account-resolver.ts";

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

const [orgId, statementId, bankArg, last4Arg] = process.argv.slice(2);
if (!orgId || !statementId || !bankArg) {
  console.error("Uso: jiti scripts/treasury-fix-statement.mjs <orgId> <statementId> <bank> [last4]");
  console.error("       bank ∈ santander | bbva | other");
  process.exit(2);
}

const bank = normalizeBank(bankArg);
const last4 = last4Arg && /^\d{1,4}$/.test(last4Arg) ? last4Arg.padStart(4, "0").slice(-4) : null;
const accountId = buildAccountId(bank, last4);
const alias = buildAccountAlias(bank, last4);

const db = getFirestore();

console.log(`\nParcheando statement ${statementId} de orgs/${orgId}`);
console.log(`  bank:      ${bank}`);
console.log(`  last4:     ${last4 ?? "(none → fallback _main)"}`);
console.log(`  accountId: ${accountId}`);
console.log(`  alias:     ${alias}`);

/* ─── 1) Patch del statement ───────────────────────────────── */
const stmtRef = db.collection("orgs").doc(orgId).collection("bank_statements").doc(statementId);
const stmtSnap = await stmtRef.get();
if (!stmtSnap.exists) {
  console.error(`\n❌ Statement ${statementId} no encontrado.`);
  process.exit(1);
}

await stmtRef.update({
  bank,
  bankName: bank === "other" ? null : bank.toUpperCase(),
  accountLast4: last4,
  accountId,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(`\n✓ Statement actualizado.`);

/* ─── 2) Asegura cuenta en treasury_accounts ───────────────── */
const accRef = db.collection("orgs").doc(orgId).collection("treasury_accounts").doc(accountId);
const accSnap = await accRef.get();
const role = bank === "santander" ? "tpv_collection"
  : bank === "bbva" ? "operating"
  : "other";
if (!accSnap.exists) {
  await accRef.set({
    id: accountId,
    bank,
    alias,
    last4: last4 ?? null,
    role,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Cuenta creada: ${accountId} (role=${role})`);
} else {
  console.log(`· Cuenta ya existe: ${accountId}`);
}

/* ─── 3) Propaga a bank_movements ──────────────────────────── */
const movSnap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("statementId", "==", statementId)
  .get();
console.log(`\nMovimientos asociados al statement: ${movSnap.size}`);

if (movSnap.size > 0) {
  let written = 0;
  const docs = movSnap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) {
      batch.update(d.ref, {
        bank,
        accountId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += Math.min(400, docs.length - i);
    process.stdout.write(`  Escrito ${written}/${docs.length}\r`);
  }
  console.log(`\n✓ ${written} movimientos actualizados con bank=${bank} accountId=${accountId}`);
}

/* ─── 4) Limpieza opcional de cuenta huérfana other_main ──── */
const orphanSnap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .where("accountId", "==", "other_main")
  .limit(1)
  .get();
if (orphanSnap.empty) {
  const otherRef = db.collection("orgs").doc(orgId).collection("treasury_accounts").doc("other_main");
  const otherSnap = await otherRef.get();
  if (otherSnap.exists && otherSnap.data().bank === "other" && accountId !== "other_main") {
    await otherRef.delete();
    console.log(`\n✓ Cuenta huérfana 'other_main' eliminada (ya nadie la usaba).`);
  }
}

console.log("\n" + "─".repeat(80));
console.log("Siguiente paso: re-corre reclassify para refrescar examples y status.");
console.log(`  ./node_modules/.bin/jiti scripts/treasury-reclassify-firestore.mjs ${orgId} --apply`);
console.log("─".repeat(80));
process.exit(0);
