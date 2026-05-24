/**
 * scripts/treasury-ingest-csv.mjs
 *
 * Ingiere un CSV bancario directo a Firestore (sin Next, sin Claude, sin token).
 * Reusa el mismo parser CSV del endpoint /extract y aplica el classifier PR1
 * + las reglas seed para que cada movimiento entre ya clasificado.
 *
 * Pensado como vía robusta cuando el endpoint /extract falla (por ejemplo
 * con PDFs grandes que truncan el JSON de Claude, o con CSV cuyo formato
 * el endpoint no reconoce). Bypasa los puntos frágiles.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-ingest-csv.mjs \
 *     <orgId> <ruta-csv> <bank> [last4]
 *
 * Ejemplo:
 *   ./node_modules/.bin/jiti scripts/treasury-ingest-csv.mjs \
 *     raiz_y_grano /Users/gere/Downloads/santander_2026.csv santander 5678
 *
 * bank ∈ {santander, bbva, other}
 * last4 opcional (4 dígitos del IBAN); si se omite → fallback "_main"
 *
 * Idempotencia: cada ingesta crea un nuevo bank_statement con id único
 * (timestamp + nanoid). Si subes el mismo archivo dos veces tendrás
 * movimientos duplicados — borra el statement viejo si te equivocas.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { nanoid } from "nanoid";
import {
  classificationToLegacyStatus,
  classifyMovement,
  deriveCashMonth,
} from "../lib/treasury/classify.ts";
import { SEED_RULES } from "../lib/treasury/seed-rules.ts";
import {
  buildAccountAlias,
  buildAccountId,
  normalizeBank,
} from "../lib/treasury/account-resolver.ts";

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
  else initializeApp({ credential: applicationDefault() });
}

/* ─── CLI ──────────────────────────────────────────────────── */
const [orgId, csvPath, bankArg, last4Arg] = process.argv.slice(2);
if (!orgId || !csvPath || !bankArg) {
  console.error("Uso: jiti scripts/treasury-ingest-csv.mjs <orgId> <ruta-csv> <bank> [last4]");
  console.error("  bank ∈ santander | bbva | other");
  process.exit(2);
}

const bank = normalizeBank(bankArg);
const accountId = buildAccountId(bank, last4Arg);
const accountAlias = buildAccountAlias(bank, last4Arg);
const last4 = last4Arg && /^\d{1,4}$/.test(last4Arg) ? last4Arg.padStart(4, "0").slice(-4) : null;

console.log(`\nIngesta directa de CSV → orgs/${orgId}`);
console.log(`  archivo:   ${csvPath}`);
console.log(`  bank:      ${bank}`);
console.log(`  accountId: ${accountId}`);
console.log("─".repeat(80));

/* ─── Lee CSV ──────────────────────────────────────────────── */
let text;
try {
  text = readFileSync(resolve(csvPath), "utf8");
} catch (e) {
  console.error(`❌ No pude leer ${csvPath}: ${e.message}`);
  process.exit(1);
}

const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
if (lines.length < 2) {
  console.error("❌ CSV vacío o sin filas de datos.");
  process.exit(1);
}

/* ─── Parser CSV (clon del endpoint /extract, robustecido) ─── */
// Detección automática de separador y de la línea de cabecera real,
// para CSVs con preámbulo (típico de Santander que mete 7 líneas con
// titular, IBAN, periodo, etc. antes de las columnas).
const sep = detectSeparator(lines);

let headerLineIdx = -1;
for (let i = 0; i < Math.min(lines.length, 50); i++) {
  const cells = parseLine(lines[i], sep).map((c) => c.toLowerCase());
  const joined = cells.join(" ");
  // BBVA Histórico abrevia "Fecha Contable" como "F. CONTABLE", igual con
  // F. VALOR / F. OPER. Ampliamos la detección a esas formas abreviadas.
  const hasFecha = /\bfecha\b|\bdate\b|\bf\.\s*(oper|cont|val)/i.test(joined);
  const hasConcepto = /\bconcepto\b|\bdescripci|\bmovimiento\b|\bdetalle\b|\bobserv|\bbenef|\bordenante/i.test(joined);
  const hasImporte = /\bimporte\b|\bcantidad\b|\bcargo\b|\babono\b|\bmonto\b/i.test(joined);
  if (hasFecha && hasConcepto && hasImporte) {
    headerLineIdx = i;
    break;
  }
}

if (headerLineIdx < 0) {
  console.error("❌ No detecto una línea de cabecera con fecha + concepto + importe en las primeras 50 líneas.");
  process.exit(1);
}

if (headerLineIdx > 0) {
  console.log(`Preámbulo detectado: ${headerLineIdx} líneas saltadas.`);
}

const headers = parseLine(lines[headerLineIdx], sep).map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
const dataStartIdx = headerLineIdx + 1;

console.log(`Separador: "${sep}" · Cabeceras: [${headers.join(", ")}]`);

// dateCol: prefer F. CONTABLE / fecha operacion; evita "valor"
let dateCol = headers.findIndex((h) => /\bf\.\s*(oper|cont)|fecha\s*(oper|cont)/i.test(h));
if (dateCol === -1) dateCol = headers.findIndex((h) => /fecha|date/i.test(h) && !/val/i.test(h));
if (dateCol === -1) dateCol = headers.findIndex((h) => /fecha|date/i.test(h));

const valueDateCol = headers.findIndex((h) => /\bf\.\s*val|fecha\s*val|value\s*date/i.test(h));

// conceptCols: TODAS las columnas de texto descriptivo. Las concatenamos
// con " | " para que el classifier vea el merchant aunque venga en una
// columna separada (caso BBVA Histórico: CONCEPTO + BENEFICIARIO + OBSERVACIONES).
const conceptCols = headers
  .map((h, i) => /concepto|descripci|concept|detalle|movimiento|observ|benef|ordenante/i.test(h) ? i : -1)
  .filter((i) => i >= 0);

const amountCol = headers.findIndex((h) => /importe|cantidad|amount|monto|total/i.test(h));
const balanceCol = headers.findIndex((h) => /saldo|balance|disponible/i.test(h));
const debitCol = headers.findIndex((h) => /\bcargo\b|d[eé]bito|debit|debe/i.test(h));
const creditCol = headers.findIndex((h) => /\babono\b|cr[eé]dito|credit|haber/i.test(h));

if (dateCol === -1 || conceptCols.length === 0) {
  console.error(`❌ No detecto columnas de fecha y/o concepto en cabeceras.`);
  console.error(`   Detected: dateCol=${dateCol}, conceptCols=[${conceptCols.join(",")}], amountCol=${amountCol}`);
  console.error(`   Cabeceras: ${JSON.stringify(headers)}`);
  process.exit(1);
}
if (amountCol === -1 && (debitCol === -1 || creditCol === -1)) {
  console.error(`❌ No detecto columna de importe ni cargo+abono separados.`);
  process.exit(1);
}
console.log(`Columnas: date=${dateCol} concept=[${conceptCols.join(",")}] amount=${amountCol} balance=${balanceCol}`);

const movementsParsed = [];
let skippedRows = 0;
for (let i = dataStartIdx; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = parseLine(line, sep);
  const rawDate = cols[dateCol]?.trim().replace(/["']/g, "");
  if (!rawDate) { skippedRows++; continue; }
  const date = normalizeDate(rawDate);
  const valueDate = valueDateCol >= 0 ? normalizeDate(cols[valueDateCol]?.trim().replace(/["']/g, "") || "") : undefined;
  const concept = conceptCols
    .map((ci) => cols[ci]?.trim().replace(/["']/g, "") || "")
    .filter((s) => s.length > 0)
    .join(" | ");
  let amount;
  if (amountCol >= 0) {
    amount = parseSpanishNumber(cols[amountCol] || "0");
  } else {
    const debit = parseSpanishNumber(cols[debitCol] || "0");
    const credit = parseSpanishNumber(cols[creditCol] || "0");
    amount = credit > 0 ? credit : -Math.abs(debit);
  }
  const balance = balanceCol >= 0 ? parseSpanishNumber(cols[balanceCol] || "") : undefined;
  if (concept && !isNaN(amount) && amount !== 0) {
    movementsParsed.push({ date, valueDate: valueDate || undefined, concept, amount, balance: balance || undefined });
  } else {
    skippedRows++;
  }
}

console.log(`Filas leídas: ${lines.length - 1} · parseadas: ${movementsParsed.length} · ignoradas: ${skippedRows}`);
if (movementsParsed.length === 0) {
  console.error("❌ Cero movimientos válidos. Revisa formato.");
  process.exit(1);
}

/* ─── Crea statement + ingesta movimientos clasificados ────── */
const totalExpenses = movementsParsed.filter((m) => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0);
const totalIncome = movementsParsed.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);

const db = getFirestore();
const statementId = `${Date.now().toString(36)}_${nanoid(8)}`;
const stmtRef = db.collection("orgs").doc(orgId).collection("bank_statements").doc(statementId);

await stmtRef.set({
  fileName: csvPath.split("/").pop(),
  sourceFormat: "csv",
  bankName: bank === "other" ? null : bank.toUpperCase(),
  accountLast4: last4,
  bank,
  accountId,
  periodStart: movementsParsed[0]?.date ?? null,
  periodEnd: movementsParsed[movementsParsed.length - 1]?.date ?? null,
  totalMovements: movementsParsed.length,
  totalExpenses: Math.round(totalExpenses * 100) / 100,
  totalIncome: Math.round(totalIncome * 100) / 100,
  processingStatus: "completed",
  uploadedBy: "cli:treasury-ingest-csv",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(`\n✓ Statement creado: ${statementId}`);

// Asegura cuenta
const accRef = db.collection("orgs").doc(orgId).collection("treasury_accounts").doc(accountId);
const accSnap = await accRef.get();
if (!accSnap.exists) {
  await accRef.set({
    id: accountId,
    bank,
    alias: accountAlias,
    last4,
    role: bank === "santander" ? "tpv_collection" : bank === "bbva" ? "operating" : "other",
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Cuenta creada: ${accountId}`);
} else {
  console.log(`· Cuenta existente: ${accountId}`);
}

// Movimientos clasificados
console.log(`\nClasificando e insertando ${movementsParsed.length} movimientos...`);
const byRule = {};
let written = 0;
for (let i = 0; i < movementsParsed.length; i += 400) {
  const batch = db.batch();
  for (const m of movementsParsed.slice(i, i + 400)) {
    const movId = nanoid(12);
    const cashMonth = deriveCashMonth(m.date);
    const cls = classifyMovement(
      { concept: m.concept, supplierName: null, amount: m.amount },
      SEED_RULES
    );
    byRule[cls.classifierSource] = (byRule[cls.classifierSource] ?? 0) + 1;
    const ref = db.collection("orgs").doc(orgId).collection("bank_movements").doc(movId);
    batch.set(ref, {
      id: movId,
      statementId,
      date: m.date,
      valueDate: m.valueDate ?? null,
      concept: m.concept,
      conceptRaw: m.concept,
      amount: m.amount,
      balance: m.balance ?? null,
      type: m.amount < 0 ? "gasto" : "ingreso",
      bank,
      accountId,
      cashMonth: cashMonth ?? null,
      category: cls.category,
      subcategory: cls.subcategory ?? null,
      flowKind: cls.flowKind,
      supplierName: cls.supplierName ?? null,
      confidence: cls.confidence,
      classifierSource: cls.classifierSource,
      classifierReason: cls.classifierReason,
      ruleVersion: cls.ruleVersion ?? null,
      status: classificationToLegacyStatus(cls),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  written += Math.min(400, movementsParsed.length - i);
  process.stdout.write(`  Escrito ${written}/${movementsParsed.length}\r`);
}

console.log(`\n✓ ${written} movimientos insertados.`);
console.log("\nbyRule:");
for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}
console.log(`\nTotal ingresos: ${totalIncome.toFixed(2)} €`);
console.log(`Total gastos:   ${totalExpenses.toFixed(2)} €`);
console.log(`Neto:           ${(totalIncome - totalExpenses).toFixed(2)} €`);

console.log("\n" + "─".repeat(80));
console.log("Siguientes pasos sugeridos:");
console.log(`  1) Inspeccionar:`);
console.log(`     ./node_modules/.bin/jiti scripts/treasury-inspect.mjs ${orgId}`);
console.log(`  2) Detectar traspasos internos contra el otro banco:`);
console.log(`     ./node_modules/.bin/jiti scripts/treasury-validate-transfers.mjs ${orgId} 2026-01-01 2026-04-30`);
console.log(`  3) Ver agregado mensual con esta cuenta incluida:`);
console.log(`     ./node_modules/.bin/jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-04`);
console.log("─".repeat(80));
process.exit(0);

/* ─── Helpers (clones de extract/route.ts) ──────────────────── */

function detectSeparator(lines) {
  // Cuenta ocurrencias de cada separador en las primeras 20 líneas, gana el más usado.
  const candidates = [";", "\t", ","];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = lines.slice(0, 20).reduce((s, l) => s + (l.match(new RegExp(escapeRegex(c), "g")) || []).length, 0);
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLine(line, sepChar) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === sepChar && !inQuotes) { result.push(current); current = ""; }
    else { current += c; }
  }
  result.push(current);
  return result;
}

function parseSpanishNumber(str) {
  const clean = String(str ?? "").replace(/["']/g, "").trim();
  if (!clean) return 0;
  if (clean.includes(",") && clean.includes(".")) {
    return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  }
  if (clean.includes(",") && !clean.includes(".")) {
    return parseFloat(clean.replace(",", "."));
  }
  return parseFloat(clean);
}

function normalizeDate(str) {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  let mt = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mt) return `${mt[3]}-${mt[2].padStart(2, "0")}-${mt[1].padStart(2, "0")}`;
  mt = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (mt) {
    const year = parseInt(mt[3]) > 50 ? `19${mt[3]}` : `20${mt[3]}`;
    return `${year}-${mt[2].padStart(2, "0")}-${mt[1].padStart(2, "0")}`;
  }
  return str;
}
