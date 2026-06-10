/**
 * enverde-quickcost-e2e.mjs — prueba REAL contra prod del "coste rápido"
 * (recipe.estimatedUnitCost) en el flujo de vinculación TPV↔escandallo.
 *
 * Org desechable + ticket sembrado por Admin SDK; las llamadas de producto
 * (POST/PATCH recipes, GET profitability-summary) van contra el deploy de
 * app.enverde.app con idToken del café, como haría la UI. Autolimpia SIEMPRE.
 *
 * Valida, en este orden:
 *   1. producto vendido sin escandallo → ingresos contados, margen 0, missing
 *   2. POST recipe vinculada con estimatedUnitCost → margen provisional + estimatedCosts
 *   3. PATCH estimatedUnitCost:0 → margen 0 otra vez, vuelve a missing con linkedRecipeId
 *   4. PATCH estimatedUnitCost:2 (añadir coste desde el aviso) → margen estimado de nuevo
 *   5. totalCost real (ingredientes) > 0 → manda sobre el estimado, estimatedCosts vacío
 *
 *   node scripts/enverde-quickcost-e2e.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

const ROOT = "/Users/gere/raiz-app";
const sa = JSON.parse(readFileSync(`${ROOT}/apps/pos/secrets/raizygrano-admin.json`, "utf-8"));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();
const adminAuth = getAuth();

const env = readFileSync(`${ROOT}/apps/pos/.env.local`, "utf-8");
const API_KEY = (env.match(/NEXT_PUBLIC_FIREBASE_API_KEY=("?)([^"\n\r]+)\1/) || [])[2];
if (!API_KEY) { console.error("No encontré NEXT_PUBLIC_FIREBASE_API_KEY"); process.exit(1); }

const BRAIN_BASE = "https://app.enverde.app";
const ORG = "enverde-quickcost-e2e";
const UID = `enverde_${ORG}`;
const PROD = { id: "p-tarta", name: "Tarta", price: 5 };

const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond, detail) => {
  log(`  ${cond ? "✓" : "✗"} ${label}${cond ? "" : `  →  ${detail}`}`);
  if (!cond) failures++;
};

async function cleanup() {
  const orgRef = db.collection("orgs").doc(ORG);
  for (const sub of ["recipes", "tickets", "members", "events", "usage"]) {
    const snap = await orgRef.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await orgRef.delete().catch(() => {});
  await db.collection("users").doc(UID).delete().catch(() => {});
  try { await adminAuth.deleteUser(UID); } catch {}
}

async function mintIdToken() {
  const token = await adminAuth.createCustomToken(UID, { enverde: true, orgId: ORG });
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error("canje de token falló: " + JSON.stringify(data).slice(0, 200));
  return data.idToken;
}

const api = (idToken) => async (method, path, body) => {
  const r = await fetch(`${BRAIN_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
};

try {
  await cleanup(); // por si quedó basura de una ejecución anterior

  /* ── provisión + ticket del mes (Admin SDK, como haría el POS) ── */
  const orgRef = db.collection("orgs").doc(ORG);
  await orgRef.set({ name: "Quickcost e2e (borrar)", source: "enverde", createdAt: new Date() });
  await orgRef.collection("members").doc(UID).set({ role: "owner", active: true, source: "enverde" });
  await db.collection("users").doc(UID).set({ uid: UID, orgIds: [ORG] });
  try { await adminAuth.createUser({ uid: UID }); } catch {}
  await orgRef.collection("tickets").add({
    items: [{ product: { id: PROD.id, name: PROD.name, price: PROD.price }, quantity: 2 }],
    total: 10,
    createdAt: Timestamp.now(),
  });

  const idToken = await mintIdToken();
  const call = api(idToken);
  const summary = async () => (await call("GET", `/api/org/${ORG}/profitability-summary`)).data.margin;

  /* ── 1. vendido sin escandallo: margen NO inventado ── */
  log("\n1) Producto vendido SIN escandallo");
  let m = await summary();
  check("source = pos", m?.source === "pos", JSON.stringify(m).slice(0, 200));
  check("ingresos contados (10€)", m?.pos?.revenue === 10, `revenue=${m?.pos?.revenue}`);
  check("margen NO inventado (0)", m?.grossMarginMonth === 0, `gross=${m?.grossMarginMonth}`);
  check("en missing, sin recipe vinculada", m?.pos?.missingEscandallo?.count === 1 && m?.pos?.missingEscandallo?.products?.[0]?.linkedRecipeId === null, JSON.stringify(m?.pos?.missingEscandallo));
  check("estimatedCosts vacío", m?.estimatedCosts?.count === 0, JSON.stringify(m?.estimatedCosts));

  /* ── 2. crear escandallo vinculado CON coste aprox. ── */
  log("\n2) POST recipe vinculada con estimatedUnitCost=1.5");
  const post = await call("POST", `/api/org/${ORG}/recipes`, { name: PROD.name, sellingPrice: PROD.price, productId: PROD.id, estimatedUnitCost: 1.5 });
  check("POST 200 con id", post.status === 200 && !!post.data.id, `${post.status} ${JSON.stringify(post.data)}`);
  const recipeId = post.data.id;
  m = await summary();
  check("margen provisional 7€ (2×(5−1.5))", m?.grossMarginMonth === 7, `gross=${m?.grossMarginMonth}`);
  check("marcado como estimado (count 1, nombre)", m?.estimatedCosts?.count === 1 && m?.estimatedCosts?.names?.[0] === PROD.name, JSON.stringify(m?.estimatedCosts));
  check("fuera de missing", m?.pos?.missingEscandallo?.count === 0, JSON.stringify(m?.pos?.missingEscandallo));

  /* ── 3. coste 0 → sin margen otra vez ── */
  log("\n3) PATCH estimatedUnitCost=0 (anular el estimado)");
  const p0 = await call("PATCH", `/api/org/${ORG}/recipes/${recipeId}`, { estimatedUnitCost: 0 });
  check("PATCH 200", p0.status === 200, `${p0.status} ${JSON.stringify(p0.data)}`);
  m = await summary();
  check("margen vuelve a 0 (coste 0 no inventa)", m?.grossMarginMonth === 0, `gross=${m?.grossMarginMonth}`);
  check("vuelve a missing CON linkedRecipeId", m?.pos?.missingEscandallo?.count === 1 && m?.pos?.missingEscandallo?.products?.[0]?.linkedRecipeId === recipeId, JSON.stringify(m?.pos?.missingEscandallo));
  check("estimatedCosts vacío", m?.estimatedCosts?.count === 0, JSON.stringify(m?.estimatedCosts));

  /* ── 4. añadir coste aprox. desde el aviso (recipe ya vinculada) ── */
  log("\n4) PATCH estimatedUnitCost=2 (el caso 'Guardar coste aprox.' del aviso)");
  await call("PATCH", `/api/org/${ORG}/recipes/${recipeId}`, { estimatedUnitCost: 2 });
  m = await summary();
  check("margen estimado 6€ (2×(5−2))", m?.grossMarginMonth === 6, `gross=${m?.grossMarginMonth}`);
  check("marcado como estimado", m?.estimatedCosts?.count === 1, JSON.stringify(m?.estimatedCosts));
  check("fuera de missing", m?.pos?.missingEscandallo?.count === 0, JSON.stringify(m?.pos?.missingEscandallo));

  /* ── 5. ingredientes reales mandan ── */
  log("\n5) totalCost=2.5 real (como dejaría el flujo de ingredientes)");
  await orgRef.collection("recipes").doc(recipeId).update({ totalCost: 2.5, foodCostPct: 50 });
  m = await summary();
  check("margen real 5€ (2×(5−2.5)), ignora el estimado", m?.grossMarginMonth === 5, `gross=${m?.grossMarginMonth}`);
  check("ya NO marcado como estimado", m?.estimatedCosts?.count === 0, JSON.stringify(m?.estimatedCosts));

  log(failures === 0 ? "\n✅ TODO OK — coste rápido verificado contra prod" : `\n❌ ${failures} checks fallaron`);
} finally {
  await cleanup();
  log(`🧹 limpieza: orgs/${ORG} + users/${UID} + auth user borrados`);
}
process.exit(failures === 0 ? 0 : 1);
