/**
 * scripts/treasury-inspect.mjs
 *
 * Lee y muestra: bank_statements, treasury_accounts, distribución de
 * accountId en bank_movements. Útil para entender por qué el detector
 * de PR2 no encuentra pares.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-inspect.mjs raiz_y_grano
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

const orgId = process.argv[2];
if (!orgId) {
  console.error("Uso: jiti scripts/treasury-inspect.mjs <orgId>");
  process.exit(2);
}

const db = getFirestore();

console.log(`\n${"═".repeat(80)}`);
console.log(`Inspección de orgs/${orgId}`);
console.log("═".repeat(80));

/* ─── bank_statements ──────────────────────────────────────── */
const stmtSnap = await db.collection("orgs").doc(orgId).collection("bank_statements").get();
console.log(`\n📋 bank_statements (${stmtSnap.size} docs)`);
console.log("─".repeat(80));
for (const d of stmtSnap.docs) {
  const x = d.data();
  console.log(`  id:             ${d.id}`);
  console.log(`  fileName:       ${x.fileName ?? "—"}`);
  console.log(`  bankName:       ${JSON.stringify(x.bankName)}`);
  console.log(`  accountLast4:   ${JSON.stringify(x.accountLast4)}`);
  console.log(`  bank (PR1):     ${JSON.stringify(x.bank)}`);
  console.log(`  accountId(PR1): ${JSON.stringify(x.accountId)}`);
  console.log(`  periodStart:    ${x.periodStart ?? "—"}`);
  console.log(`  periodEnd:      ${x.periodEnd ?? "—"}`);
  console.log(`  totalMovements: ${x.totalMovements ?? "—"}`);
  console.log(`  totalIncome:    ${x.totalIncome ?? "—"}`);
  console.log(`  totalExpenses:  ${x.totalExpenses ?? "—"}`);
  console.log("");
}

/* ─── treasury_accounts ────────────────────────────────────── */
const accSnap = await db.collection("orgs").doc(orgId).collection("treasury_accounts").get();
console.log(`\n🏦 treasury_accounts (${accSnap.size} docs)`);
console.log("─".repeat(80));
for (const d of accSnap.docs) {
  const x = d.data();
  console.log(`  ${d.id.padEnd(20)}  bank=${x.bank}  role=${x.role}  alias=${x.alias}`);
}

/* ─── bank_movements: distribución de accountId / bank ──────── */
const movSnap = await db.collection("orgs").doc(orgId).collection("bank_movements").get();
const accountDist = {};
const bankDist = {};
const flowKindDist = {};
const sampleByAccount = {};

for (const d of movSnap.docs) {
  const x = d.data();
  const accId = x.accountId ?? "<sin accountId>";
  const bank = x.bank ?? "<sin bank>";
  const flow = x.flowKind ?? "<sin flowKind>";
  accountDist[accId] = (accountDist[accId] ?? 0) + 1;
  bankDist[bank] = (bankDist[bank] ?? 0) + 1;
  flowKindDist[flow] = (flowKindDist[flow] ?? 0) + 1;
  if (!sampleByAccount[accId]) sampleByAccount[accId] = [];
  if (sampleByAccount[accId].length < 3) {
    sampleByAccount[accId].push({ date: x.date, concept: x.concept, amount: x.amount });
  }
}

console.log(`\n💰 bank_movements (${movSnap.size} docs)`);
console.log("─".repeat(80));
console.log("\nPor accountId:");
for (const [acc, n] of Object.entries(accountDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${acc}`);
  for (const s of sampleByAccount[acc].slice(0, 2)) {
    console.log(`        ej: ${s.date}  ${Number(s.amount).toFixed(2).padStart(10)} €  ${(s.concept ?? "").slice(0, 60)}`);
  }
}
console.log("\nPor bank:");
for (const [b, n] of Object.entries(bankDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${b}`);
}
console.log("\nPor flowKind:");
for (const [f, n] of Object.entries(flowKindDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${f}`);
}

console.log("\n" + "═".repeat(80));
process.exit(0);
