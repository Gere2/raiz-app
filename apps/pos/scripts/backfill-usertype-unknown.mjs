import admin from "firebase-admin";
import { readFileSync } from "fs";
const creds = JSON.parse(readFileSync("secrets/raizygrano-admin.json","utf8"));
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

const snap = await db.collection("orders").get();
let updated = 0;
for (const doc of snap.docs) {
  if (!doc.data().userType) {
    await doc.ref.update({ userType: "unknown" });
    updated++;
  }
}
console.log(`Done: ${updated}/${snap.size} orders marked as userType: "unknown"`);
