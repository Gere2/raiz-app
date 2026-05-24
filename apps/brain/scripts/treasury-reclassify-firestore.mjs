/**
 * scripts/treasury-reclassify-firestore.mjs
 *
 * Reclasifica movimientos directo contra Firestore (sin servidor, sin token).
 * Equivalente al endpoint /treasury/reclassify pero corriendo en Node con jiti.
 *
 * Lee todas las reglas seed (no Firestore) y aplica la misma lógica del
 * endpoint: migra campos faltantes (bank, accountId, cashMonth, conceptRaw)
 * y reclassifica salvo classifierSource = manual / learned / detector:*.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-reclassify-firestore.mjs raiz_y_grano                # dryRun por defecto
 *   ./node_modules/.bin/jiti scripts/treasury-reclassify-firestore.mjs raiz_y_grano --apply         # escribe
 *   ./node_modules/.bin/jiti scripts/treasury-reclassify-firestore.mjs raiz_y_grano --apply --force # pisa manuales
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  classifyMovement,
  classificationToLegacyStatus,
  deriveCashMonth,
} from "../lib/treasury/classify.ts";
import { SEED_RULES } from "../lib/treasury/seed-rules.ts";
import {
  buildAccountAlias,
  buildAccountId,
  normalizeBank,
} from "../lib/treasury/account-resolver.ts";

const BATCH_CHUNK = 400;

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

/* ─── CLI ──────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const orgId = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const force = args.includes("--force");
const dryRun = !apply;

if (!orgId) {
  console.error("Uso: jiti scripts/treasury-reclassify-firestore.mjs <orgId> [--apply] [--force]");
  process.exit(2);
}

console.log(`\n${dryRun ? "DRY RUN" : "APPLY"} reclassify para orgs/${orgId}${force ? " (force = pisa manuals)" : ""}`);
console.log("─".repeat(80));

const db = getFirestore();

/* ─── Carga movimientos ────────────────────────────────────── */
const movSnap = await db.collection("orgs").doc(orgId)
  .collection("bank_movements")
  .get();
const movements = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`Movimientos cargados: ${movements.length}`);

if (movements.length === 0) process.exit(0);

/* ─── Carga statements para inferir bank ───────────────────── */
const stmtIds = [...new Set(movements.map((m) => m.statementId).filter(Boolean))];
const stmtMap = new Map();
for (let i = 0; i < stmtIds.length; i += 500) {
  const refs = stmtIds.slice(i, i + 500).map((id) =>
    db.collection("orgs").doc(orgId).collection("bank_statements").doc(id)
  );
  const snaps = await db.getAll(...refs);
  for (const s of snaps) {
    if (s.exists) stmtMap.set(s.id, s.data());
  }
}
console.log(`Statements cargados: ${stmtMap.size}`);

/* ─── Carga cuentas existentes ─────────────────────────────── */
const accSnap = await db.collection("orgs").doc(orgId)
  .collection("treasury_accounts")
  .get();
const accountsMap = new Map(accSnap.docs.map((d) => [d.id, d.data()]));
console.log(`Cuentas existentes: ${accountsMap.size}`);

/* ─── Loop ─────────────────────────────────────────────────── */
const updates = [];
const newAccountIds = new Set();
const byRule = {};
const examples = [];
let skippedManual = 0;
let skippedDetector = 0;
let skippedNoChange = 0;

for (const m of movements) {
  // 1) Migración de campos
  const stmt = m.statementId ? stmtMap.get(m.statementId) : null;
  const migrate = {};
  if (!m.bank) migrate.bank = normalizeBank(stmt?.bankName);
  if (!m.accountId) {
    const bank = migrate.bank ?? normalizeBank(stmt?.bankName);
    migrate.accountId = buildAccountId(bank, stmt?.accountLast4);
  }
  if (!m.cashMonth) {
    const cm = deriveCashMonth(m.date);
    if (cm) migrate.cashMonth = cm;
  }
  if (!m.conceptRaw && m.concept) migrate.conceptRaw = m.concept;

  if (migrate.accountId) newAccountIds.add(migrate.accountId);

  // 2) Decisión de reclasificación
  const src = m.classifierSource ?? "";
  let decision = "reclassify";
  if (!force && (src === "manual" || src === "learned")) decision = "skip-manual";
  else if (!force && src.startsWith("detector:")) decision = "skip-detector";

  if (decision !== "reclassify") {
    if (decision === "skip-manual") skippedManual++;
    if (decision === "skip-detector") skippedDetector++;
    if (Object.keys(migrate).length > 0) {
      updates.push({ id: m.id, data: { ...migrate, updatedAt: FieldValue.serverTimestamp() } });
    }
    continue;
  }

  // 3) Clasificar
  const cls = classifyMovement(
    {
      concept: m.concept ?? null,
      supplierName: m.supplierName ?? null,
      amount: Number(m.amount) || 0,
    },
    SEED_RULES
  );

  const changed =
    m.classifierSource !== cls.classifierSource ||
    m.category !== cls.category ||
    m.flowKind !== cls.flowKind ||
    (m.subcategory ?? null) !== (cls.subcategory ?? null) ||
    Number(m.confidence ?? -1) !== cls.confidence ||
    Number(m.ruleVersion ?? null) !== Number(cls.ruleVersion ?? null);

  if (!changed && Object.keys(migrate).length === 0) {
    skippedNoChange++;
    continue;
  }

  byRule[cls.classifierSource] = (byRule[cls.classifierSource] ?? 0) + 1;

  const data = {
    ...migrate,
    category: cls.category,
    subcategory: cls.subcategory ?? null,
    flowKind: cls.flowKind,
    confidence: cls.confidence,
    classifierSource: cls.classifierSource,
    classifierReason: cls.classifierReason,
    ruleVersion: cls.ruleVersion ?? null,
    status: classificationToLegacyStatus(cls),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (cls.supplierName && !m.supplierName) data.supplierName = cls.supplierName;

  updates.push({ id: m.id, data });

  if (examples.length < 5) {
    examples.push({
      id: m.id,
      date: m.date,
      concept: m.concept,
      amount: m.amount,
      before: { category: m.category, flowKind: m.flowKind, classifierSource: m.classifierSource },
      after: { category: cls.category, subcategory: cls.subcategory, flowKind: cls.flowKind, classifierSource: cls.classifierSource, confidence: cls.confidence },
    });
  }
}

/* ─── Reporte ──────────────────────────────────────────────── */
console.log(`\n${updates.length} updates pendientes (${dryRun ? "no se escriben en dryRun" : "se aplicarán"})`);
console.log(`  skippedManual:   ${skippedManual}`);
console.log(`  skippedDetector: ${skippedDetector}`);
console.log(`  skippedNoChange: ${skippedNoChange}`);
console.log(`  cuentas detectadas: ${[...newAccountIds].join(", ") || "(ninguna)"}`);
console.log("\nbyRule:");
for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}
console.log("\nExamples (primeros 5):");
for (const ex of examples) {
  console.log(`  ${ex.date}  ${Number(ex.amount).toFixed(2).padStart(10)} €  ${ex.before.classifierSource ?? "<sin>"} → ${ex.after.classifierSource}`);
  console.log(`    ${ex.concept}`);
}

/* ─── Apply ────────────────────────────────────────────────── */
if (!dryRun && updates.length > 0) {
  // Crea cuentas faltantes
  for (const accId of newAccountIds) {
    if (accountsMap.has(accId)) continue;
    const [bank, last4Maybe] = accId.split("_");
    const last4 = last4Maybe && last4Maybe !== "main" ? last4Maybe : null;
    const ref = db.collection("orgs").doc(orgId).collection("treasury_accounts").doc(accId);
    await ref.set({
      id: accId,
      bank: normalizeBank(bank),
      alias: buildAccountAlias(normalizeBank(bank), last4),
      last4: last4 || null,
      role: bank === "santander" ? "tpv_collection" : bank === "bbva" ? "operating" : "other",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ Cuenta creada: ${accId}`);
  }

  // Batch updates
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    for (const op of updates.slice(i, i + BATCH_CHUNK)) {
      const ref = db.collection("orgs").doc(orgId).collection("bank_movements").doc(op.id);
      batch.update(ref, op.data);
    }
    await batch.commit();
    written += Math.min(BATCH_CHUNK, updates.length - i);
    process.stdout.write(`  Escrito ${written}/${updates.length}\r`);
  }
  console.log(`\n  ✓ ${written} movimientos actualizados.`);
} else if (dryRun) {
  console.log("\nPara aplicar, vuelve a correr con --apply:");
  console.log(`  ./node_modules/.bin/jiti scripts/treasury-reclassify-firestore.mjs ${orgId} --apply`);
}

console.log("\n" + "─".repeat(80));
process.exit(0);
