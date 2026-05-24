import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [,, orgId, orgName, ownerUid] = process.argv;

if (!orgId || !orgName || !ownerUid) {
  console.log("Uso: node scripts/create-org.mjs <orgId> <orgName> <ownerUid>");
  process.exit(1);
}

const orgRef = db.collection("orgs").doc(orgId);
const memberRef = orgRef.collection("members").doc(ownerUid);

await db.runTransaction(async (tx) => {
  tx.set(orgRef, {
    id: orgId,
    name: orgName,
    createdAt: new Date(),
  }, { merge: true });

  tx.set(memberRef, {
    uid: ownerUid,
    role: "owner",
    createdAt: new Date(),
  }, { merge: true });

  // opcional: índice rápido en users/{uid}
  tx.set(db.collection("users").doc(ownerUid), {
    uid: ownerUid,
    orgIds: Array.from(new Set([orgId])),
    updatedAt: new Date(),
  }, { merge: true });
});

console.log("OK ✅ org creada:", orgId, "owner:", ownerUid);
