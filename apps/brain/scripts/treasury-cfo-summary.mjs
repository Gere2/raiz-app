/**
 * scripts/treasury-cfo-summary.mjs
 *
 * Genera el resumen CFO/CEO de un mes. Si ya está cacheado en Firestore
 * y el scenarioHash coincide, lo devuelve sin volver a llamar a Claude.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-cfo-summary.mjs <orgId> <YYYY-MM> [--regenerate] [--no-prev]
 *
 * Ejemplos:
 *   jiti scripts/treasury-cfo-summary.mjs raiz_y_grano 2026-04
 *   jiti scripts/treasury-cfo-summary.mjs raiz_y_grano 2026-04 --regenerate
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault, getApps }
  from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { aggregateMonth } from "../lib/treasury/monthly-aggregator.ts";
import { deriveCashMonth } from "../lib/treasury/classify.ts";
import { generateCFOSummary } from "../lib/treasury/cfo-summary.ts";
import { DEFAULT_ASSUMPTIONS } from "../lib/treasury/seed-accounts.ts";

const here = dirname(fileURLToPath(import.meta.url));
try {
  const txt = readFileSync(resolve(here, "../.env.local"), "utf8");
  for (const l of txt.split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("=");
    if (eq < 0) continue;
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
const [orgId, month] = positional;
const regenerate = args.includes("--regenerate");
const includePrevious = !args.includes("--no-prev");

if (!orgId || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  console.error("Uso: jiti scripts/treasury-cfo-summary.mjs <orgId> <YYYY-MM> [--regenerate] [--no-prev]");
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY no está en el entorno (revisa .env.local).");
  process.exit(1);
}

const db = getFirestore();

async function loadMonthSnapshot(monthId) {
  const [y, m] = monthId.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${monthId}-01`;
  const to = `${monthId}-${String(last).padStart(2, "0")}`;

  const movsSnap = await db.collection("orgs").doc(orgId)
    .collection("bank_movements")
    .where("date", ">=", from).where("date", "<=", to).get();
  const movements = movsSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id, date: String(x.date ?? ""),
      amount: Number(x.amount) || 0,
      concept: x.concept ?? null,
      category: x.category ?? null, subcategory: x.subcategory ?? null,
      flowKind: x.flowKind ?? null,
      classifierSource: x.classifierSource ?? null,
      cashMonth: x.cashMonth ?? deriveCashMonth(x.date),
      economicMonth: x.economicMonth ?? null,
      accountId: x.accountId ?? null,
    };
  });

  const accSnap = await db.collection("orgs").doc(orgId).collection("treasury_accruals")
    .where("economicMonth", "==", monthId).get().catch(() => ({ docs: [] }));
  const accruals = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const defaultDoc = await db.collection("orgs").doc(orgId).collection("treasury_assumptions").doc("_default").get();
  const monthDoc = await db.collection("orgs").doc(orgId).collection("treasury_assumptions").doc(monthId).get();
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(defaultDoc.exists ? defaultDoc.data() : {}),
    ...(monthDoc.exists ? monthDoc.data() : {}),
  };

  return aggregateMonth({ monthId, movements, accruals, assumptions });
}

const previousMonth = (mid) => {
  const m = mid.match(/^(\d{4})-(\d{2})$/); if (!m) return null;
  let y = Number(m[1]); let mo = Number(m[2]) - 1;
  if (mo === 0) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
};

console.log(`\nGenerando resumen CFO para ${orgId} · ${month}${regenerate ? " (regenerate)" : ""}`);
console.log("─".repeat(80));

const cacheRef = db.collection("orgs").doc(orgId).collection("treasury_monthly_snapshots").doc(month);
const snapshot = await loadMonthSnapshot(month);

let summary = null;
let fromCache = false;
if (!regenerate) {
  const c = await cacheRef.get();
  const cached = c.exists ? c.data()?.aiSummary : null;
  if (cached && cached.scenarioHashAtGeneration === snapshot.scenarioHash) {
    summary = cached;
    fromCache = true;
  }
}

if (!summary) {
  const previousSnapshot = includePrevious && previousMonth(month)
    ? await loadMonthSnapshot(previousMonth(month))
    : undefined;

  const t0 = Date.now();
  console.log("Llamando a Claude...");
  summary = await generateCFOSummary(snapshot, { previousSnapshot });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ Resumen generado en ${elapsed}s`);
  console.log(`   tokens: input=${summary.inputTokens ?? "?"} cacheRead=${summary.cacheReadTokens ?? 0} cacheCreate=${summary.cacheCreationTokens ?? 0} output=${summary.outputTokens ?? "?"}`);

  await cacheRef.set({
    monthId: month,
    aiSummary: summary,
    snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ Guardado en treasury_monthly_snapshots/${month}.aiSummary`);
} else {
  console.log(`✓ Cargado desde cache (scenarioHash coincide).`);
}

console.log("\n" + "═".repeat(80));
console.log(`Resumen CFO/CEO · ${month}`);
console.log("═".repeat(80));
const labels = {
  quePaso: "Qué pasó",
  porquePaso: "Por qué pasó",
  queBien: "Qué está bien",
  quePreocupa: "Qué te preocupa",
  queDecision: "Qué decisión tomar",
  sueldoGeremi: "Sueldo Geremi",
  queFaltaVerde: "Qué falta para verde",
};
for (const [k, label] of Object.entries(labels)) {
  console.log(`\n■ ${label}`);
  console.log(`  ${summary.blocks[k]}`);
}
console.log("\n" + "═".repeat(80));
console.log(`Generado: ${summary.generatedAt}  ·  modelo: ${summary.model}  ·  fromCache: ${fromCache}`);
console.log("─".repeat(80));
process.exit(0);
