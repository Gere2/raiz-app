import admin from "firebase-admin";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("./secrets/raizygrano-admin.json","utf8"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

// ── 1. Cargar mapa de categorías ──
async function loadCategories() {
  const snap = await db.collection("categories").get();
  const map = {};
  snap.forEach(doc => {
    const d = doc.data();
    map[doc.id] = d.name || d.nombre || doc.id;
  });
  console.log(`Loaded ${Object.keys(map).length} categories:`, map);
  return map;
}

// ── 2. Generar pares de productos ──
function generatePairs(names) {
  const unique = [...new Set(names)].sort();
  if (unique.length < 2) return { itemPairs: [], itemPairCount: 0, hasMultipleItems: false };
  const pairs = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      pairs.push(`${unique[i]} + ${unique[j]}`);
    }
  }
  return { itemPairs: pairs, itemPairCount: pairs.length, hasMultipleItems: true };
}

// ── 3. Backfill tickets ──
async function backfillTickets(catMap) {
  const snap = await db.collection("tickets").get();
  let updated = 0, skipped = 0, errors = 0;

  const batches = [];
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Skip si ya tiene categoryNames
    if (data.categoryNames && data.categoryNames.length > 0) {
      skipped++;
      continue;
    }

    try {
      const items = data.items || [];
      
      // Resolver categoryNames desde items[].product.category
      const catIds = items
        .map(i => i.product?.category || "sin categoría")
        .filter((v, i, a) => a.indexOf(v) === i);
      const categoryNames = catIds.map(id => catMap[id] || id);

      // Generar pares desde items[].product.name
      const names = items.map(i => i.product?.name || "Unknown");
      const pairings = generatePairs(names);

      batch.update(doc.ref, {
        categoryNames,
        itemPairs: pairings.itemPairs,
        itemPairCount: pairings.itemPairCount,
        hasMultipleItems: pairings.hasMultipleItems,
        backfilledV3: true,
        backfilledV3At: admin.firestore.FieldValue.serverTimestamp(),
      });

      updated++;
      batchCount++;

      if (batchCount >= 450) {
        batches.push(batch);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      errors++;
      console.error(`Ticket ${doc.id} error:`, err.message);
    }
  }

  if (batchCount > 0) batches.push(batch);

  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`  Tickets batch ${i + 1}/${batches.length} committed`);
  }

  console.log(`TICKETS: ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

// ── 4. Backfill orders ──
async function backfillOrders(catMap) {
  const snap = await db.collection("orders").get();
  let updated = 0, skipped = 0, errors = 0;

  const batches = [];
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data.categoryNames && data.categoryNames.length > 0) {
      skipped++;
      continue;
    }

    try {
      const items = data.items || [];

      // Orders usan productName (no product.name)
      const names = items.map(i => i.productName || i.product?.name || "Unknown");
      const pairings = generatePairs(names);

      // Resolver categorías desde uniqueCategories (IDs) si existen
      const catIds = data.uniqueCategories || [];
      const categoryNames = catIds.map(id => catMap[id] || id);

      batch.update(doc.ref, {
        categoryNames,
        itemPairs: pairings.itemPairs,
        itemPairCount: pairings.itemPairCount,
        hasMultipleItems: pairings.hasMultipleItems,
        backfilledV3: true,
        backfilledV3At: admin.firestore.FieldValue.serverTimestamp(),
      });

      updated++;
      batchCount++;

      if (batchCount >= 450) {
        batches.push(batch);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      errors++;
      console.error(`Order ${doc.id} error:`, err.message);
    }
  }

  if (batchCount > 0) batches.push(batch);

  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`  Orders batch ${i + 1}/${batches.length} committed`);
  }

  console.log(`ORDERS: ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

// ── Run ──
async function main() {
  console.log("=== BACKFILL V3: categoryNames + itemPairs ===");
  const catMap = await loadCategories();
  await backfillTickets(catMap);
  await backfillOrders(catMap);
  console.log("=== DONE ===");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
