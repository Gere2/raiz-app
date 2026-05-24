#!/usr/bin/env node
/**
 * Lista las orgs existentes en raiz-app con sus owners.
 * Útil para saber el orgId antes de ejecutar create-viewer-user.mjs.
 *
 *   node scripts/list-orgs.mjs
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const orgsSnap = await db.collection("orgs").get();

if (orgsSnap.empty) {
  console.log("No hay orgs en este proyecto.");
  process.exit(0);
}

console.log(`\n${orgsSnap.size} orgs encontradas:\n`);

for (const orgDoc of orgsSnap.docs) {
  const data = orgDoc.data();
  const membersSnap = await orgDoc.ref.collection("members").get();
  console.log(`  • ${orgDoc.id}  (${data.name || "sin nombre"})`);
  console.log(`    miembros: ${membersSnap.size}`);
  for (const m of membersSnap.docs) {
    const md = m.data();
    console.log(`      - ${md.email || "(sin email)"}  role=${md.role || "(sin role)"}  uid=${m.id}`);
  }
  console.log("");
}
