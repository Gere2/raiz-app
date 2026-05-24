import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [,, uid, orgId] = process.argv;
if (!uid || !orgId) {
  console.log("Uso: node scripts/upsert-user-org.mjs <uid> <orgId>");
  process.exit(1);
}

await db.collection("users").doc(uid).set({
  uid,
  orgIds: FieldValue.arrayUnion(orgId),
  updatedAt: new Date(),
}, { merge: true });

console.log("OK ✅ user actualizado:", { uid, orgId });
