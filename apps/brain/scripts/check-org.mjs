import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [,, orgId, uid] = process.argv;
if (!orgId || !uid) {
  console.log("Uso: node scripts/check-org.mjs <orgId> <uid>");
  process.exit(1);
}

const orgSnap = await db.collection("orgs").doc(orgId).get();
const memberSnap = await db.collection("orgs").doc(orgId).collection("members").doc(uid).get();

console.log("ORG exists:", orgSnap.exists, orgSnap.exists ? orgSnap.data() : null);
console.log("MEMBER exists:", memberSnap.exists, memberSnap.exists ? memberSnap.data() : null);
