/**
 * backfill-daily-stats.mjs
 * Genera product_daily_stats desde todos los tickets + orders históricos.
 * Usa setDoc merge para acumular atómicamente.
 */
import admin from "firebase-admin";
import { readFileSync } from "fs";

const creds = JSON.parse(readFileSync("secrets/raizygrano-admin.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function getDateStr(ts) {
  if (!ts) return null;
  const d = ts._seconds ? new Date(ts._seconds * 1000) : ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}

function getTimeSlot(hour) {
  if (hour < 9) return "early_morning";
  if (hour < 11) return "morning";
  if (hour < 13) return "mid_morning";
  if (hour < 15) return "lunch";
  if (hour < 17) return "afternoon";
  return "closing";
}

async function processTransaction(data, source) {
  const date = getDateStr(data.createdAt || data.date);
  if (!date) return 0;

  const items = data.items || [];
  if (items.length === 0) return 0;

  const timeSlot = data.timeSlot || getTimeSlot(data.hourOfDay || 9);
  const paymentMethod = data.paymentMethod || "CASH";
  const allProductIds = items.map(i => (i.product?.id || i.productId));

  let count = 0;

  for (const item of items) {
    const productId = item.product?.id || item.productId;
    const productName = item.product?.name || item.productName || "unknown";
    const category = item.product?.category || item.category || "sin categoría";
    const qty = item.quantity || item.qty || 1;
    const price = item.product?.price || item.unitPrice || 0;

    if (!productId) continue;

    const docId = `${productId.replace(/[\/\\]/g, "_")}_${date}`;
    const docRef = db.collection("product_daily_stats").doc(docId);

    const pairedIds = allProductIds.filter(id => id && id !== productId);

    const updateData = {
      productId,
      productName,
      category,
      date,
      unitsSold: FieldValue.increment(qty),
      revenue: FieldValue.increment(price * qty),
      timesInOrder: FieldValue.increment(1),
      [`salesByTimeSlot.${timeSlot}`]: FieldValue.increment(qty),
      [`salesByPayment.${paymentMethod}`]: FieldValue.increment(qty),
      [`salesBySource.${source}`]: FieldValue.increment(qty),
      lastUpdated: FieldValue.serverTimestamp(),
    };

    if (pairedIds.length > 0) {
      updateData.pairedProductIds = FieldValue.arrayUnion(...pairedIds);
    }

    await docRef.set(updateData, { merge: true });
    count++;
  }

  return count;
}

async function main() {
  // Get existing dates to know what's already covered
  const existingSnap = await db.collection("product_daily_stats").get();
  const existingDates = new Set();
  existingSnap.forEach(d => existingDates.add(d.data().date));
  console.log(`Existing stats cover ${existingDates.size} dates: ${[...existingDates].sort().join(", ")}`);

  // Process tickets
  const ticketsSnap = await db.collection("tickets").get();
  console.log(`\nProcessing ${ticketsSnap.size} tickets...`);

  let ticketUpdates = 0;
  let skippedTickets = 0;

  for (const doc of ticketsSnap.docs) {
    const data = doc.data();
    const date = getDateStr(data.createdAt || data.date);

    // Skip dates already covered by real-time stats
    if (date && existingDates.has(date)) {
      skippedTickets++;
      continue;
    }

    const count = await processTransaction(data, "POS");
    ticketUpdates += count;
  }

  console.log(`  Tickets: ${ticketUpdates} product-day entries created, ${skippedTickets} skipped (already covered)`);

  // Process orders
  const ordersSnap = await db.collection("orders").get();
  console.log(`\nProcessing ${ordersSnap.size} orders...`);

  let orderUpdates = 0;
  let skippedOrders = 0;

  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    const date = getDateStr(data.createdAt || data.date);

    if (date && existingDates.has(date)) {
      skippedOrders++;
      continue;
    }

    const count = await processTransaction(data, "APP");
    orderUpdates += count;
  }

  console.log(`  Orders: ${orderUpdates} product-day entries created, ${skippedOrders} skipped`);

  // Final count
  const finalSnap = await db.collection("product_daily_stats").get();
  const finalDates = new Set();
  finalSnap.forEach(d => finalDates.add(d.data().date));
  console.log(`\n✅ Done! Total: ${finalSnap.size} docs covering ${finalDates.size} dates`);
}

main().catch(console.error);
