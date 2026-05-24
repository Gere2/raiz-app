/**
 * scripts/treasury-validate.mjs
 *
 * Validador OFFLINE del classifier PR1 contra tus movimientos reales.
 * No toca Firestore. No requiere servidor corriendo.
 *
 * Uso:
 *   1) Exporta tus movimientos a JSON desde el endpoint GET existente:
 *
 *      curl -s 'https://<host>/api/org/<orgId>/treasury/movements?quarter=2026-Q1&limit=500' \
 *           -H 'authorization: Bearer <token>' > /tmp/q1.json
 *      curl -s 'https://<host>/api/org/<orgId>/treasury/movements?quarter=2026-Q2&limit=500' \
 *           -H 'authorization: Bearer <token>' > /tmp/q2.json
 *
 *   2) Corre el validador:
 *
 *      cd apps/brain && ./node_modules/.bin/jiti scripts/treasury-validate.mjs /tmp/q1.json /tmp/q2.json
 *
 * Acepta tanto el formato `{ ok, movements: [...] }` como un array crudo.
 *
 * Imprime:
 *   - byRule           ¿qué regla matcheó cada movimiento?
 *   - byFlowKind       ¿cuántos van a TPV / op / card_pending / drawing / review?
 *   - confirmaciones   las 7 verificaciones específicas que pediste
 *   - sin clasificar   los movimientos que se quedan en needs_review (para mejorar reglas)
 */

import fs from "node:fs";
import { classifyMovement, deriveCashMonth }
  from "../lib/treasury/classify.ts";
import { SEED_RULES } from "../lib/treasury/seed-rules.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error(
    "Uso: jiti scripts/treasury-validate.mjs <archivo.json> [<archivo2.json> ...]"
  );
  process.exit(2);
}

const movements = [];
for (const p of paths) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`No pude leer/parsear ${p}: ${e.message}`);
    process.exit(2);
  }
  const arr = Array.isArray(raw) ? raw : raw.movements ?? raw.docs ?? [];
  movements.push(...arr);
}

if (movements.length === 0) {
  console.error("No hay movimientos en los archivos pasados.");
  process.exit(2);
}

const byRule = {};
const byFlowKind = {};
const byCategorySub = {};
const monthByFlowKind = {};
const needsReview = [];
const proofPoints = {
  amazon: [],
  ufv: [],
  anthropic: [],
  openai: [],
  amor_perfecto: [],
  card_9415: [],
  card_2288: [],
  partner_drawing: [],
  tpv: [],
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
  const catKey = `${cls.category}/${cls.subcategory ?? "—"}`;
  byCategorySub[catKey] = (byCategorySub[catKey] ?? 0) + 1;

  const month = deriveCashMonth(m.date) ?? "??";
  const mfk = monthByFlowKind[month] ?? (monthByFlowKind[month] = {});
  mfk[cls.flowKind] = (mfk[cls.flowKind] ?? 0) + 1;

  if (cls.flowKind === "needs_review") {
    needsReview.push({
      date: m.date,
      concept: m.concept,
      amount: m.amount,
    });
  }

  // Proof points
  const lc = (m.concept || "").toLowerCase();
  const push = (key) =>
    proofPoints[key].length < 3 &&
    proofPoints[key].push({
      date: m.date,
      concept: m.concept,
      amount: m.amount,
      cls: `${cls.category}/${cls.subcategory ?? "—"}/${cls.flowKind}`,
      source: cls.classifierSource,
    });
  if (lc.includes("amazon") || lc.includes("amzn")) push("amazon");
  if (/francisco\s+de\s+vitoria|fund\.?\s*fco|\bufv\b/i.test(m.concept || ""))
    push("ufv");
  if (lc.includes("anthropic") || lc.includes("claude.ai")) push("anthropic");
  if (lc.includes("openai") || lc.includes("chatgpt")) push("openai");
  if (lc.includes("amor perfecto")) push("amor_perfecto");
  if (/9415/.test(m.concept || "")) push("card_9415");
  if (/2288/.test(m.concept || "")) push("card_2288");
  if (/retirada|reintegro|cajero/i.test(m.concept || "")) push("partner_drawing");
  if (/redsys|liquidacion tarjeta|liquidación tarjeta|comercio santander/i.test(
      m.concept || ""
    ) && Number(m.amount) > 0)
    push("tpv");
}

const sortObj = (o) =>
  Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

console.log(`\nValidación PR1 sobre ${movements.length} movimientos`);
console.log("─".repeat(78));
console.log(`Volumen absoluto total: ${totalAbs.toFixed(2)} €`);

console.log("\nbyRule");
console.table(sortObj(byRule));

console.log("\nbyFlowKind");
console.table(sortObj(byFlowKind));

console.log("\nbyCategorySub (top 30)");
const top = Object.entries(byCategorySub)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);
console.table(Object.fromEntries(top));

console.log("\nFlowKind por mes (CFO scan)");
const months = Object.keys(monthByFlowKind).sort();
const flowOrder = [
  "income_sales_tpv",
  "income_other",
  "expense_operating",
  "card_pending",
  "partner_drawing",
  "internal_transfer",
  "needs_review",
];
const table = {};
for (const month of months) {
  table[month] = {};
  for (const f of flowOrder) table[month][f] = monthByFlowKind[month][f] ?? 0;
}
console.table(table);

console.log("\n── Confirmaciones específicas ──");
const confirm = (label, cond) =>
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
const allMatchProof = (key, expectedCls) =>
  proofPoints[key].length > 0 &&
  proofPoints[key].every((p) => p.cls === expectedCls);
const someMatchProof = (key, expectedCls) =>
  proofPoints[key].length > 0 &&
  proofPoints[key].some((p) => p.cls === expectedCls);

confirm(
  "Amazon → materia_prima/leche_suministros_amazon/expense_operating",
  proofPoints.amazon.length === 0 ||
    allMatchProof("amazon", "materia_prima/leche_suministros_amazon/expense_operating")
);
confirm(
  "UFV → suministros/luz_gas/expense_operating",
  proofPoints.ufv.length === 0 ||
    allMatchProof("ufv", "suministros/luz_gas/expense_operating")
);
confirm(
  "Anthropic → tecnologia/ia/expense_operating",
  proofPoints.anthropic.length === 0 ||
    allMatchProof("anthropic", "tecnologia/ia/expense_operating")
);
confirm(
  "OpenAI → tecnologia/ia/expense_operating",
  proofPoints.openai.length === 0 ||
    allMatchProof("openai", "tecnologia/ia/expense_operating")
);
confirm(
  "Amor Perfecto → materia_prima/cafe/expense_operating",
  proofPoints.amor_perfecto.length === 0 ||
    allMatchProof("amor_perfecto", "materia_prima/cafe/expense_operating")
);
confirm(
  "Tarjeta *9415 → tarjeta_pendiente/tarjeta_9415/card_pending (NO expense_operating)",
  proofPoints.card_9415.length === 0 ||
    allMatchProof("card_9415", "tarjeta_pendiente/tarjeta_9415/card_pending")
);
confirm(
  "Tarjeta *2288 → tarjeta_pendiente/tarjeta_2288/card_pending (NO expense_operating)",
  proofPoints.card_2288.length === 0 ||
    allMatchProof("card_2288", "tarjeta_pendiente/tarjeta_2288/card_pending")
);
confirm(
  "Retirada/cajero → disposicion_socio/retirada_socio/partner_drawing",
  proofPoints.partner_drawing.length === 0 ||
    allMatchProof("partner_drawing", "disposicion_socio/retirada_socio/partner_drawing")
);
confirm(
  "Liquidaciones TPV positivas → ventas_tpv/tpv/income_sales_tpv",
  proofPoints.tpv.length === 0 ||
    allMatchProof("tpv", "ventas_tpv/tpv/income_sales_tpv")
);

const showProof = (label, key) => {
  if (proofPoints[key].length === 0) {
    console.log(`\n  ${label}: (sin movimientos que matcheen el patrón)`);
    return;
  }
  console.log(`\n  ${label}: ${proofPoints[key].length} ejemplos`);
  for (const p of proofPoints[key]) {
    console.log(
      `    · ${p.date}  ${(p.amount ?? 0).toFixed(2).padStart(10)} €  ${p.cls}  ← ${p.concept}`
    );
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
  console.log(
    "  Estos movimientos quedan en flowKind=needs_review. Si reconoces patrones,"
  );
  console.log(
    "  podemos añadir reglas adicionales (manual o vía learnedFrom)."
  );
  for (const m of needsReview.slice(0, 30)) {
    console.log(
      `    · ${m.date}  ${Number(m.amount).toFixed(2).padStart(10)} €  ${m.concept}`
    );
  }
  if (needsReview.length > 30) {
    console.log(`    ... y ${needsReview.length - 30} más`);
  }
}

console.log("\n" + "─".repeat(78));
console.log("Si la salida luce sana, decime y arranco PR2 (traspasos internos).");
