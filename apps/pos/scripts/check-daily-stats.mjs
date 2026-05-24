import admin from "firebase-admin";
import { readFileSync } from "fs";
const creds = JSON.parse(readFileSync("secrets/raizygrano-admin.json","utf8"));
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

const snap = await db.collection("product_daily_stats").get();
console.log(`product_daily_stats docs: ${snap.size}`);
if (snap.size > 0) {
  const dates = new Set();
  snap.forEach(d => dates.add(d.data().date));
  console.log(`Dates covered: ${[...dates].sort().join(", ")}`);
  snap.docs.slice(0, 3).forEach(d => console.log(JSON.stringify(d.data(), null, 2)));
}
