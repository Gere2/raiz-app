import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [,, orgId, uid, role] = process.argv;

if (!orgId || !uid || !role) {
  console.log("Uso: node scripts/add-member.mjs <orgId> <uid> <role>");
  console.log("Roles: owner | admin | staff | viewer");
  process.exit(1);
}

if (!["owner","admin","staff","viewer"].includes(role)) {
  console.log("Role inválido:", role);
  process.exit(1);
}

await db.collection("orgs").doc(orgId).collection("members").doc(uid).set({
  uid,
  role,
  createdAt: new Date(),
}, { merge: true });

await db.collection("users").doc(uid).set({
  uid,
  orgIds: [orgId],
  updatedAt: new Date(),
}, { merge: true });

console.log("OK ✅ miembro añadido:", { orgId, uid, role });
