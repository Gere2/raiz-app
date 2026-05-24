import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

const [,, uid, orgId] = process.argv;
if (!uid || !orgId) {
  console.log("Uso: node scripts/set-user-org.mjs <uid> <orgId>");
  process.exit(1);
}

// Lee service account desde GOOGLE_APPLICATION_CREDENTIALS (recomendado)
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath || !fs.existsSync(credsPath)) {
  console.error("Falta GOOGLE_APPLICATION_CREDENTIALS o no existe el archivo:", credsPath);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(credsPath, "utf8"));

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

await db.collection("users").doc(uid).set(
  {
    uid,
    orgIds: [orgId],
    updatedAt: new Date(),
  },
  { merge: true }
);

console.log("OK ✅ users/{uid} actualizado:", { uid, orgId });
