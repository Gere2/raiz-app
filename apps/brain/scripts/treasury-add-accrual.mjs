/**
 * scripts/treasury-add-accrual.mjs
 *
 * Crea un accrual (devengo manual) directo en Firestore. Sin servidor, sin token.
 *
 *   ./node_modules/.bin/jiti scripts/treasury-add-accrual.mjs \
 *     <orgId> <YYYY-MM> <amount> <category> [--sub=<subcategory>] [--supplier=<name>] [--desc="<text>"]
 *
 * Ejemplo (660 € café pendiente abril):
 *   jiti scripts/treasury-add-accrual.mjs raiz_y_grano 2026-04 -660 materia_prima \
 *     --sub=cafe --supplier="Amor Perfecto" --desc="Factura abril sin pagar"
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

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [orgId, monthId, amountStr, category] = positional;
const flagOf = (name) => {
  const f = args.find((a) => a.startsWith(`--${name}=`));
  return f ? f.split("=").slice(1).join("=") : undefined;
};

if (!orgId || !monthId || !amountStr || !category) {
  console.error("Uso: jiti scripts/treasury-add-accrual.mjs <orgId> <YYYY-MM> <amount> <category> [--sub=...] [--supplier=...] [--desc=...]");
  process.exit(2);
}
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) {
  console.error("monthId inválido. Formato YYYY-MM."); process.exit(2);
}
const amount = Number(amountStr);
if (isNaN(amount)) { console.error("amount no numérico"); process.exit(2); }

const db = getFirestore();
const ref = db.collection("orgs").doc(orgId).collection("treasury_accruals").doc();

const data = {
  economicMonth: monthId,
  amount,
  category,
  subcategory: flagOf("sub") ?? null,
  supplierName: flagOf("supplier") ?? null,
  description: flagOf("desc") ?? null,
  status: "pending",
  createdBy: "cli:treasury-add-accrual",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
};

await ref.set(data);
console.log(`✓ Accrual creado: ${ref.id}`);
console.log(`   month=${data.economicMonth} amount=${amount} ${category}/${data.subcategory ?? "—"}`);
console.log(`   ${data.description ?? ""}`);
console.log(`\nVer impacto:`);
console.log(`  jiti scripts/treasury-validate-monthly.mjs ${orgId} 2026-01 2026-04`);
process.exit(0);
