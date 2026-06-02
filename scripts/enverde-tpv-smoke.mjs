/**
 * enverde-tpv-smoke.mjs — café enverde de prueba REAL, end-to-end, headless donde
 * se puede y con un humano para el render.
 *
 * Modos:
 *   (sin arg)  link     → provisiona el café + emite enlace "Abrir TPV" + verifica
 *                         el canje del token y la /api/my-orgs DESPLEGADA.
 *   seed                → siembra catálogo (1 categoría + 1 producto con id fijo) +
 *                         escandallo (receta) para que el POS muestre el producto y
 *                         los márgenes tengan coste. Idempotente.
 *   margins             → acuña idToken del café y llama la /margins DESPLEGADA del
 *                         brain → imprime KPIs/items (lo que ve el café tras vender).
 *   cleanup             → borra TODO el subárbol del café de prueba (no deja basura).
 *
 *   node scripts/enverde-tpv-smoke.mjs [link|seed|margins|cleanup]
 *
 * Cierra el gap honesto de enverde-pos-login-proof.mjs (que solo validaba el
 * mecanismo Firebase en sandbox y limpiaba en el acto): aquí el café, el enlace,
 * el catálogo y los márgenes son REALES y PERSISTEN para una prueba visual humana.
 * Lo único no cubierto es el render React en sí (eso lo cubre tsc + revisión).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

const ROOT = "/Users/gere/raiz-app";
const sa = JSON.parse(readFileSync(`${ROOT}/apps/pos/secrets/raizygrano-admin.json`, "utf-8"));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();
const adminAuth = getAuth();

const env = readFileSync(`${ROOT}/apps/pos/.env.local`, "utf-8");
const API_KEY = (env.match(/NEXT_PUBLIC_FIREBASE_API_KEY=("?)([^"\n\r]+)\1/) || [])[2];

const POS_BASE = "https://pos.raizygrano.com";
const BRAIN_BASE = "https://brain.raizygrano.com";
const ORG = "enverde-tpv-smoke";
const UID = `enverde_${ORG}`;
const ORG_NAME = "TPV smoke test (borrar)";
const log = (...a) => console.log(...a);
const eur = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} €`;

// Catálogo de prueba — id FIJO para enlazar receta↔producto↔item-de-ticket.
// El POS escribe en el ticket { product: {id,name,price}, quantity }; márgenes
// cruza recipe.productId === item.product.id → por eso el id debe ser estable.
const CAT = { id: "cat-cafes", name: "Cafés" };
const PROD = { id: "p-cortado", name: "Cortado", price: 1.5, category: CAT.id };
const RECIPE = { id: "r-cortado", productId: PROD.id, name: "Cortado", totalCost: 0.45, foodCostPct: 30 };

async function provision() {
  const orgRef = db.collection("orgs").doc(ORG);
  await orgRef.set({ name: ORG_NAME, source: "enverde", createdAt: new Date() }, { merge: true });
  await orgRef.collection("members").doc(UID).set({ role: "owner", active: true, source: "enverde" }, { merge: true });
  await db.collection("users").doc(UID).set({ uid: UID, orgIds: [ORG] }, { merge: true });
  // Espejo de /api/enverde/provision: displayName=orgName en el user del bridge
  // (así el ticket del POS usa user.displayName y userName lleva el nombre del café).
  try { await adminAuth.updateUser(UID, { displayName: ORG_NAME }); }
  catch { try { await adminAuth.createUser({ uid: UID, displayName: ORG_NAME }); } catch {} }
}

async function mintIdToken() {
  const token = await adminAuth.createCustomToken(UID, { enverde: true, orgId: ORG });
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error("canje falló: " + JSON.stringify(data).slice(0, 300));
  return { token, idToken: data.idToken };
}

async function cleanup() {
  const orgRef = db.collection("orgs").doc(ORG);
  for (const sub of ["products", "categories", "recipes", "tickets", "members", "skus"]) {
    const snap = await orgRef.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await orgRef.delete().catch(() => {});
  await db.collection("users").doc(UID).delete().catch(() => {});
  try { await adminAuth.deleteUser(UID); } catch {}
}

const mode = process.argv[2] || "link";

if (mode === "cleanup") {
  await cleanup();
  log(`✓ borrado el subárbol completo: orgs/${ORG} (products/categories/recipes/tickets/members) + users/${UID} + auth user`);
  process.exit(0);
}

if (!API_KEY) { console.error("No encontré NEXT_PUBLIC_FIREBASE_API_KEY en apps/pos/.env.local"); process.exit(1); }

if (mode === "seed") {
  await provision(); // idempotente
  const orgRef = db.collection("orgs").doc(ORG);
  await orgRef.collection("categories").doc(CAT.id).set({ name: CAT.name, createdAt: new Date() }, { merge: true });
  await orgRef.collection("products").doc(PROD.id).set(
    { name: PROD.name, price: PROD.price, category: PROD.category, available: true, createdAt: new Date() },
    { merge: true }
  );
  await orgRef.collection("recipes").doc(RECIPE.id).set(
    { productId: RECIPE.productId, name: RECIPE.name, totalCost: RECIPE.totalCost, foodCostPct: RECIPE.foodCostPct },
    { merge: true }
  );
  log(`✓ catálogo sembrado en orgs/${ORG}:`);
  log(`   categoría: ${CAT.name}`);
  log(`   producto : ${PROD.name} — ${eur(PROD.price)}  (id ${PROD.id})`);
  log(`   escandallo: coste ${eur(RECIPE.totalCost)} → food cost ${RECIPE.foodCostPct}% → margen ${eur(PROD.price - RECIPE.totalCost)}/u`);
  log(`\nRecarga ${POS_BASE}/pos (como el café de prueba): verás "${PROD.name}". Véndelo en efectivo.`);
  log(`Luego:  node scripts/enverde-tpv-smoke.mjs margins`);
  process.exit(0);
}

if (mode === "margins") {
  const { idToken } = await mintIdToken();
  const r = await fetch(`${BRAIN_BASE}/api/org/${ORG}/margins?days=30`, { headers: { Authorization: `Bearer ${idToken}` } });
  const m = await r.json().catch(() => ({}));
  log(`Márgenes DESPLEGADOS (brain) para orgs/${ORG} → HTTP ${r.status}\n`);
  if (r.status !== 200) { log(JSON.stringify(m)); process.exit(1); }
  const k = m.kpis || {};
  log(`  ingresos:    ${eur(k.totalRevenue || 0)}`);
  log(`  coste:       ${eur(k.totalCost || 0)}`);
  log(`  beneficio:   ${eur(k.grossProfit || 0)}`);
  log(`  food cost:   ${k.avgFoodCostPct ?? 0}%   ·   margen: ${k.avgMarginPct ?? 0}%`);
  log(`  por producto:`);
  for (const it of m.items || []) {
    log(`    · ${String(it.productName).padEnd(12)} ${it.unitsSold}u  rev ${eur(it.revenue)}  ${it.hasCostData ? `coste/u ${eur(it.unitCost)}  profit ${eur(it.totalProfit)}  FC ${it.foodCostPct}%` : "(sin coste)"}`);
  }
  if (!(m.items || []).length) log(`    (sin ventas todavía — vende el Cortado en ${POS_BASE}/pos y reintenta)`);
  process.exit(0);
}

// mode === "link" (default): provisiona + enlace + verificación del camino de datos
log("\n══════ TPV smoke: café enverde REAL → enlace + verificación de camino de datos ══════\n");
await provision();
log(`1) Provisionado (REAL, persiste en prod): orgs/${ORG} + members/${UID} + users/${UID}.orgIds=[${ORG}]`);

const { token, idToken } = await mintIdToken();
const link = `${POS_BASE}/enverde-login?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/pos")}`;
log(`\n2) ENLACE "Abrir TPV" (canjeable ~1h):\n${link}\n`);

const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf-8"));
log(`3) Token canjeado ✓  uid=${payload.user_id || payload.sub}  claims: enverde=${payload.enverde} orgId=${payload.orgId}`);

const rec = await adminAuth.getUser(UID);
log(`3b) Perfil de auth del café: displayName=${JSON.stringify(rec.displayName)}  ·  idToken name=${JSON.stringify(payload.name)}  (esperado ${JSON.stringify(ORG_NAME)} → el POS usa user.displayName como userName del ticket)`);

const mo = await fetch(`${POS_BASE}/api/my-orgs`, { headers: { Authorization: `Bearer ${idToken}` } });
const moBody = await mo.json().catch(() => ({}));
log(`4) POS /api/my-orgs (DESPLEGADA) → HTTP ${mo.status}  ${JSON.stringify(moBody)}`);

const ok = mo.status === 200 && Array.isArray(moBody.orgs) && moBody.orgs.some((o) => o.id === ORG) && payload.orgId === ORG && rec.displayName === ORG_NAME;
log(`\nRESULTADO: ${ok ? "✅ camino de datos REAL + displayName del café probados contra prod. Solo falta tu click para confirmar el render." : "⚠️ revisar lo de arriba."}`);
log(`\nSiguiente:  node scripts/enverde-tpv-smoke.mjs seed   (catálogo + escandallo para el loop venta→márgenes)`);
log(`Al terminar: node scripts/enverde-tpv-smoke.mjs cleanup`);
process.exit(ok ? 0 : 1);
