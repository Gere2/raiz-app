/**
 * scripts/treasury-validate-firestore.mjs
 *
 * Validador PR1 que se conecta directo a Firestore con firebase-admin.
 * No necesita Next dev corriendo, ni tokens de usuario. Usa las mismas
 * credenciales que .env.local (FIREBASE_ADMIN_JSON o GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Uso:
 *   cd apps/brain
 *   ./node_modules/.bin/jiti scripts/treasury-validate-firestore.mjs raiz_y_grano 2026-01-01 2026-04-30
 *
 * Args:
 *   1) orgId        ej: raiz_y_grano
 *   2) dateFrom     YYYY-MM-DD inclusive
 *   3) dateTo       YYYY-MM-DD inclusive
 *
 * Imprime el mismo informe que el validator offline + el detalle real de
 * cuántos movimientos cambiarían si lanzaras reclassify.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { classifyMovement, deriveCashMonth }
  from "../lib/treasury/classify.ts";
import { SEED_RULES } from "../lib/treasury/seed-rules.ts";

const here = dirname(fileURLToPath(import.meta.url));

/* ─── Carga .env.local manual (sin dotenv) ──────────────────── */
function loadDotenv() {
  try {
    const txt = readFileSync(resolve(here, "../.env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // sin .env.local → confiamos en variables del shell
  }
}
loadDotenv();

/* ─── Init firebase-admin ──────────────────────────────────────
 * IMPORTANTE: priorizamos FIREBASE_ADMIN_JSON (inline en .env.local) sobre
 * GOOGLE_APPLICATION_CREDENTIALS porque esta última puede venir exportada
 * desde el shell apuntando a un archivo que ya no existe.
 */
function initAdmin() {
  if (getApps().length) return;

  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    let sa;
    try { sa = JSON.parse(json); }
    catch { throw new Error("FIREBASE_ADMIN_JSON contiene JSON inválido"); }
    initializeApp({ credential: cert(sa) });
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }

  throw new Error(
    "Falta FIREBASE_ADMIN_JSON o GOOGLE_APPLICATION_CREDENTIALS en .env.local"
  );
}

/* ─── CLI args ──────────────────────────────────────────────── */
const [orgId, dateFrom, dateTo] = process.argv.slice(2);
if (!orgId || !dateFrom || !dateTo) {
  console.error(
    "Uso: jiti scripts/treasury-validate-firestore.mjs <orgId> <YYYY-MM-DD> <YYYY-MM-DD>"
  );
  console.error("Ejemplo: jiti scripts/treasury-validate-firestore.mjs raiz_y_grano 2026-01-01 2026-04-30");
  process.exit(2);
}

initAdmin();
const db = getFirestore();

/* ─── Fetch movimientos en rango ────────────────────────────── */
console.log(`\nLeyendo bank_movements de orgs/${orgId} entre ${dateFrom} y ${dateTo}...`);
const snap = await db
  .collection("orgs")
  .doc(orgId)
  .collection("bank_movements")
  .where("date", ">=", dateFrom)
  .where("date", "<=", dateTo)
  .orderBy("date", "asc")
  .get();

const movements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`Cargados ${movements.length} movimientos.\n`);

if (movements.length === 0) {
  console.log("No hay movimientos en ese rango. ¿Subiste extractos? ¿El orgId es correcto?");
  process.exit(0);
}

/* ─── Clasifica con SEED_RULES y compara con lo guardado ──── */
const byRule = {};
const byFlowKind = {};
const byCategorySub = {};
const monthByFlowKind = {};
const willChange = []; // movimientos cuyo classifierSource cambiaría
const needsReview = [];
const proofPoints = {
  amazon: [], ufv: [], anthropic: [], openai: [], amor_perfecto: [],
  card_9415: [], card_2288: [], partner_drawing: [], tpv: [],
};

let totalAbs = 0;

for (const m of movements) {
  const cls = classifyMovement(
    {
      concept: m.concept ?? m.conceptRaw ?? "",
      supplierName: m.supplierName ?? null,
      amount: Number(m.amount) || 0,
    },
    SEED_RULES
  );
  totalAbs += Math.abs(Number(m.amount) || 0);

  byRule[cls.classifierSource] = (byRule[cls.classifierSource] ?? 0) + 1;
  byFlowKind[cls.flowKind] = (byFlowKind[cls.flowKind] ?? 0) + 1;
  byCategorySub[`${cls.category}/${cls.subcategory ?? "—"}`] =
    (byCategorySub[`${cls.category}/${cls.subcategory ?? "—"}`] ?? 0) + 1;

  const month = deriveCashMonth(m.date) ?? "??";
  const mfk = monthByFlowKind[month] ?? (monthByFlowKind[month] = {});
  mfk[cls.flowKind] = (mfk[cls.flowKind] ?? 0) + 1;

  const stored = m.classifierSource ?? "<sin clasificar>";
  if (stored !== cls.classifierSource) {
    willChange.push({
      id: m.id,
      date: m.date,
      concept: m.concept,
      amount: m.amount,
      before: stored,
      after: cls.classifierSource,
    });
  }

  if (cls.flowKind === "needs_review") {
    needsReview.push({ date: m.date, concept: m.concept, amount: m.amount });
  }

  const lc = (m.concept || "").toLowerCase();
  const push = (key) =>
    proofPoints[key].length < 3 &&
    proofPoints[key].push({
      date: m.date, concept: m.concept, amount: m.amount,
      cls: `${cls.category}/${cls.subcategory ?? "—"}/${cls.flowKind}`,
      source: cls.classifierSource,
    });
  if (lc.includes("amazon") || lc.includes("amzn")) push("amazon");
  if (/francisco\s+de\s+vitoria|fund\.?\s*fco|\bufv\b/i.test(m.concept || "")) push("ufv");
  if (lc.includes("anthropic") || lc.includes("claude.ai")) push("anthropic");
  if (lc.includes("openai") || lc.includes("chatgpt")) push("openai");
  if (lc.includes("amor perfecto")) push("amor_perfecto");
  if (/9415/.test(m.concept || "")) push("card_9415");
  if (/2288/.test(m.concept || "")) push("card_2288");
  if (/retirada|reintegro|cajero/i.test(m.concept || "")) push("partner_drawing");
  if (/redsys|liquidacion tarjeta|liquidación tarjeta|comercio santander/i.test(m.concept || "") && Number(m.amount) > 0)
    push("tpv");
}

const sortObj = (o) =>
  Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

console.log("─".repeat(78));
console.log(`Volumen absoluto total: ${totalAbs.toFixed(2)} €`);

console.log("\nbyRule");
console.table(sortObj(byRule));

console.log("\nbyFlowKind");
console.table(sortObj(byFlowKind));

console.log("\nbyCategorySub (top 30)");
console.table(Object.fromEntries(
  Object.entries(byCategorySub).sort((a, b) => b[1] - a[1]).slice(0, 30)
));

console.log("\nFlowKind por mes (CFO scan)");
const months = Object.keys(monthByFlowKind).sort();
const flowOrder = [
  "income_sales_tpv", "income_other", "expense_operating",
  "card_pending", "partner_drawing", "internal_transfer", "needs_review",
];
const tbl = {};
for (const month of months) {
  tbl[month] = {};
  for (const f of flowOrder) tbl[month][f] = monthByFlowKind[month][f] ?? 0;
}
console.table(tbl);

console.log("\n── Confirmaciones específicas ──");
const confirm = (label, cond) => console.log(`  ${cond ? "✓" : "✗"} ${label}`);
const allMatch = (key, expected) =>
  proofPoints[key].length > 0 && proofPoints[key].every((p) => p.cls === expected);

confirm("Amazon → materia_prima/leche_suministros_amazon/expense_operating",
  proofPoints.amazon.length === 0 || allMatch("amazon", "materia_prima/leche_suministros_amazon/expense_operating"));
confirm("UFV → suministros/luz_gas/expense_operating",
  proofPoints.ufv.length === 0 || allMatch("ufv", "suministros/luz_gas/expense_operating"));
confirm("Anthropic → tecnologia/ia/expense_operating",
  proofPoints.anthropic.length === 0 || allMatch("anthropic", "tecnologia/ia/expense_operating"));
confirm("OpenAI → tecnologia/ia/expense_operating",
  proofPoints.openai.length === 0 || allMatch("openai", "tecnologia/ia/expense_operating"));
confirm("Amor Perfecto → materia_prima/cafe/expense_operating",
  proofPoints.amor_perfecto.length === 0 || allMatch("amor_perfecto", "materia_prima/cafe/expense_operating"));
confirm("Tarjeta *9415 → tarjeta_pendiente/tarjeta_9415/card_pending",
  proofPoints.card_9415.length === 0 || allMatch("card_9415", "tarjeta_pendiente/tarjeta_9415/card_pending"));
confirm("Tarjeta *2288 → tarjeta_pendiente/tarjeta_2288/card_pending",
  proofPoints.card_2288.length === 0 || allMatch("card_2288", "tarjeta_pendiente/tarjeta_2288/card_pending"));
confirm("Retirada/cajero → disposicion_socio/partner_drawing",
  proofPoints.partner_drawing.length === 0 || allMatch("partner_drawing", "disposicion_socio/retirada_socio/partner_drawing"));
confirm("TPV positivos → ventas_tpv/income_sales_tpv",
  proofPoints.tpv.length === 0 || allMatch("tpv", "ventas_tpv/tpv/income_sales_tpv"));

const showProof = (label, key) => {
  if (proofPoints[key].length === 0) {
    console.log(`\n  ${label}: (sin movimientos que matcheen el patrón)`);
    return;
  }
  console.log(`\n  ${label}: ${proofPoints[key].length} ejemplos`);
  for (const p of proofPoints[key]) {
    console.log(`    · ${p.date}  ${(p.amount ?? 0).toFixed(2).padStart(10)} €  ${p.cls}  ← ${p.concept}`);
  }
};
console.log("\n── Evidencia ──");
showProof("Amazon", "amazon");
showProof("UFV", "ufv");
showProof("Anthropic", "anthropic");
showProof("OpenAI", "openai");
showProof("Amor Perfecto", "amor_perfecto");
showProof("Tarjeta 9415", "card_9415");
showProof("Tarjeta 2288", "card_2288");
showProof("Retiradas / cajero", "partner_drawing");
showProof("TPV / Redsys", "tpv");

console.log(`\n── Sin clasificar (${needsReview.length}) ──`);
if (needsReview.length === 0) {
  console.log("  Cero movimientos en needs_review. Cobertura completa.");
} else {
  for (const m of needsReview.slice(0, 30)) {
    console.log(`    · ${m.date}  ${Number(m.amount).toFixed(2).padStart(10)} €  ${m.concept}`);
  }
  if (needsReview.length > 30) console.log(`    ... y ${needsReview.length - 30} más`);
}

console.log(`\n── Reclassify preview ──`);
console.log(`  ${willChange.length} de ${movements.length} movimientos cambiarían su classifierSource si corres reclassify de verdad.`);
if (willChange.length > 0) {
  console.log(`  Primeros 10 cambios:`);
  for (const w of willChange.slice(0, 10)) {
    console.log(`    · ${w.date}  ${Number(w.amount).toFixed(2).padStart(10)} €  ${w.before} → ${w.after}  ← ${w.concept}`);
  }
}

console.log("\n" + "─".repeat(78));
console.log("Pega esto al asistente para que confirme luz verde para PR2.");
process.exit(0);
