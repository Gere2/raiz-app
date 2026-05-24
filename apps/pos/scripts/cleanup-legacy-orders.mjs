import admin from "firebase-admin";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("./secrets/raizygrano-admin.json","utf8"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection("orders").get();
  let canceled = 0, skipped = 0;

  const batch = db.batch();
  snap.forEach(doc => {
    const data = doc.data();
    const status = data.status;
    // Legacy statuses que no están en el flujo actual
    if (status === "pending" || status === "PAYMENT_PENDING") {
      batch.update(doc.ref, {
        status: "CANCELED",
        canceledReason: "legacy_cleanup",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      canceled++;
      console.log(`  Cancel: ${doc.id} (was: ${status})`);
    } else {
      skipped++;
    }
  });

  if (canceled > 0) {
    await batch.commit();
  }
  console.log(`\nDone: ${canceled} canceled, ${skipped} skipped`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
