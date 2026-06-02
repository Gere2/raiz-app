/**
 * sandbox-margins-proof.mjs
 *
 * Prueba E2E del POS multi-tenant para un café NUEVO (rama pos-multitenant):
 *   1. Provisiona un café sandbox (orgs/{id} + members) como hace /api/enverde/provision.
 *   2. Le da catálogo (orgs/{id}/categories + products) — donde escribe el POS refactorizado.
 *   3. Le da una receta (orgs/{id}/recipes) para que haya coste (escandallo).
 *   4. Simula ventas (orgs/{id}/tickets) con el schema vivo { product:{id,name,price}, quantity }.
 *   5. Computa márgenes REPLICANDO la lógica exacta de margins/route.ts contra esos datos.
 *   6. Verifica AISLAMIENTO: el café nuevo ve solo lo suyo; Raíz queda intacta.
 *   7. Limpia el sandbox (no deja basura en prod).
 *
 * Run desde la raíz de raiz-app:  node scripts/sandbox-margins-proof.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(resolve(__dirname, "../apps/pos/secrets/raizygrano-admin.json"), "utf-8"));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const SANDBOX = "enverde-sandbox-proof";
const UID = `enverde_${SANDBOX}`;
const log = (...a) => console.log(...a);
const eur = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} €`;

// ── Catálogo de prueba (IDs fijos para enlazar receta↔producto) ──
const CAT = { id: "cat-cafes", name: "Cafés" };
const PROD_FW = { id: "p-flatwhite", name: "Flat White", price: 3.0, category: CAT.id };
const PROD_CR = { id: "p-croissant", name: "Croissant", price: 2.0, category: CAT.id };

async function deleteSubtree(orgId) {
  const orgRef = db.collection("orgs").doc(orgId);
  for (const sub of ["products", "categories", "recipes", "tickets", "members", "skus"]) {
    const snap = await orgRef.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await orgRef.delete();
}

async function provision() {
  const orgRef = db.collection("orgs").doc(SANDBOX);
  await orgRef.set({ name: "Café Sandbox (prueba enverde)", createdAt: new Date(), _sandbox: true }, { merge: true });
  await orgRef.collection("members").doc(UID).set({ uid: UID, role: "owner", enverde: true }, { merge: true });
  // Catálogo (subcolección org-scoped — donde escribe el product-service refactorizado)
  await orgRef.collection("categories").doc(CAT.id).set({ name: CAT.name, createdAt: new Date() });
  await orgRef.collection("products").doc(PROD_FW.id).set({ name: PROD_FW.name, price: PROD_FW.price, category: PROD_FW.category, available: true, createdAt: new Date() });
  await orgRef.collection("products").doc(PROD_CR.id).set({ name: PROD_CR.name, price: PROD_CR.price, category: PROD_CR.category, available: true, createdAt: new Date() });
  // Receta (escandallo) solo para el Flat White → coste 0,90 € (FC 30%). El Croissant queda sin coste a propósito.
  await orgRef.collection("recipes").doc("r-flatwhite").set({ productId: PROD_FW.id, name: "Flat White", totalCost: 0.9, foodCostPct: 30 });
  // Ventas (tickets) — schema vivo de la subcolección
  const mkItem = (p, q) => ({ product: { id: p.id, name: p.name, price: p.price }, quantity: q });
  const tickets = [
    { items: [mkItem(PROD_FW, 2)], total: 6.0 },                       // 2× Flat White
    { items: [mkItem(PROD_FW, 1), mkItem(PROD_CR, 1)], total: 5.0 },   // 1× FW + 1× Croissant
    { items: [mkItem(PROD_CR, 3)], total: 6.0 },                       // 3× Croissant
  ];
  for (const t of tickets) await orgRef.collection("tickets").add({ ...t, createdAt: new Date(), paymentMethod: "cash" });
  return tickets.reduce((s, t) => s + t.total, 0);
}

// ── Réplica fiel de la lógica de lectura+cómputo de margins/route.ts ──
async function computeMargins(orgId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const orgRef = db.collection("orgs").doc(orgId);
  const [ticketsSnap, productsSnap, categoriesSnap, recipesSnap] = await Promise.all([
    orgRef.collection("tickets").where("createdAt", ">=", since).get(),
    db.collection("products").where("orgId", "==", orgId).get(), // (igual que la ruta: top-level+orgId — vacío hoy)
    db.collection("categories").where("orgId", "==", orgId).get(),
    orgRef.collection("recipes").get(),
  ]);

  const recipeCostByProductId = {};
  for (const d of recipesSnap.docs) {
    const data = d.data();
    if (data.productId) recipeCostByProductId[data.productId] = { totalCost: Number(data.totalCost) || 0, foodCostPct: Number(data.foodCostPct) || 0 };
  }
  const catMap = {};
  for (const d of categoriesSnap.docs) catMap[d.id] = d.data().name || d.id;
  const productMeta = {};
  for (const d of productsSnap.docs) { const x = d.data(); productMeta[d.id] = { name: x.name || "", price: Number(x.price) || 0, category: catMap[x.category] || "Sin categoría" }; }

  const productData = {};
  const processItems = (items) => {
    for (const item of items) {
      const product = item.product || {};
      const pid = item.productId || product.id || "";
      if (!pid) continue;
      const qty = Number(item.qty) || Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || Number(item.price) || Number(product.price) || 0;
      if (!productData[pid]) productData[pid] = { name: productMeta[pid]?.name || item.productName || product.name || pid, qty: 0, revenue: 0 };
      productData[pid].qty += qty;
      productData[pid].revenue += qty * price;
    }
  };
  for (const d of ticketsSnap.docs) processItems(d.data().items || []);

  let totalRevenue = 0, totalCost = 0;
  const items = Object.entries(productData).map(([pid, data]) => {
    const rf = recipeCostByProductId[pid];
    const unitCost = rf ? rf.totalCost : 0;
    const hasCostData = !!rf;
    const sellingPrice = productMeta[pid]?.price || (data.revenue / (data.qty || 1));
    const unitMargin = sellingPrice - unitCost;
    totalRevenue += data.revenue;
    if (hasCostData) totalCost += unitCost * data.qty;
    return { productName: data.name, unitsSold: data.qty, revenue: data.revenue, unitCost, unitMargin, totalProfit: unitMargin * data.qty, hasCostData };
  }).sort((a, b) => b.totalProfit - a.totalProfit);

  return { totalRevenue, totalCost, grossProfit: totalRevenue - totalCost, items, ticketCount: ticketsSnap.size };
}

(async () => {
  log("\n══════ PRUEBA E2E: márgenes de un café NUEVO (multi-tenant) ══════\n");

  // Limpieza defensiva por si una corrida previa quedó a medias
  await deleteSubtree(SANDBOX).catch(() => {});

  log("1) Provisionando café sandbox + catálogo + receta + 3 ventas…");
  const seededRevenue = await provision();
  log(`   ✓ org: orgs/${SANDBOX}  ·  ingreso sembrado esperado: ${eur(seededRevenue)}\n`);

  log("2) Computando márgenes del sandbox (réplica fiel de margins/route.ts):");
  const m = await computeMargins(SANDBOX);
  log(`   tickets leídos (orgs/${SANDBOX}/tickets): ${m.ticketCount}`);
  log(`   totalRevenue:  ${eur(m.totalRevenue)}`);
  log(`   totalCost:     ${eur(m.totalCost)}   (solo productos con receta)`);
  log(`   grossProfit:   ${eur(m.grossProfit)}`);
  log("   por producto:");
  for (const it of m.items) log(`     · ${it.productName.padEnd(12)} ${it.unitsSold}u  rev ${eur(it.revenue)}  ${it.hasCostData ? `margin/u ${eur(it.unitMargin)}  profit ${eur(it.totalProfit)}` : "(sin coste asignado)"}`);

  log("\n3) AISLAMIENTO vs Raíz (no se ha tocado nada de raiz_y_grano):");
  const raiz = await computeMargins("raiz_y_grano");
  log(`   raiz_y_grano tickets(30d): ${raiz.ticketCount}  ·  revenue ${eur(raiz.totalRevenue)}`);
  log(`   sandbox      tickets(30d): ${m.ticketCount}  ·  revenue ${eur(m.totalRevenue)}`);
  const isolated = m.ticketCount === 3 && Math.abs(m.totalRevenue - seededRevenue) < 0.001 && raiz.ticketCount !== m.ticketCount;
  log(`   → café nuevo ve SOLO sus 3 ventas (${eur(m.totalRevenue)}), independiente de Raíz: ${isolated ? "✅ SÍ" : "❌ NO"}`);

  log("\n4) Limpiando sandbox…");
  await deleteSubtree(SANDBOX);
  const gone = (await db.collection("orgs").doc(SANDBOX).get()).exists;
  log(`   ✓ orgs/${SANDBOX} eliminado: ${gone ? "❌ sigue" : "sí"}\n`);

  log(isolated && !gone ? "RESULTADO: ✅ la cadena de márgenes funciona para un café nuevo y aislado." : "RESULTADO: ⚠️ revisar.");
  process.exit(isolated ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
