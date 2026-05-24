#!/usr/bin/env node
/**
 * Revoca completamente el acceso de un usuario viewer.
 * - Elimina la membership en orgs/{orgId}/members/{uid}
 * - Deshabilita el usuario en Firebase Auth (no lo borra: se puede reactivar)
 *
 *   node scripts/revoke-viewer.mjs <orgId> <email>
 *
 * Para uso emergencia: si se filtran las credenciales de una vendedora.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

const [, , orgId, email] = process.argv;

if (!orgId || !email) {
  console.log("Uso: node scripts/revoke-viewer.mjs <orgId> <email>");
  process.exit(1);
}

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  console.error(`❌ Usuario ${email} no encontrado en Auth.`);
  process.exit(1);
}

// 1) Quitar membership.
await db.collection("orgs").doc(orgId).collection("members").doc(user.uid).delete();
console.log(`✓ Membership eliminada en orgs/${orgId}/members/${user.uid}`);

// 2) Deshabilitar usuario en Auth (no se borra, se puede reactivar).
await auth.updateUser(user.uid, { disabled: true });
console.log(`✓ Usuario ${email} deshabilitado en Firebase Auth (uid=${user.uid})`);

// 3) Revocar todos los tokens existentes (la sesión actual se invalida).
await auth.revokeRefreshTokens(user.uid);
console.log(`✓ Tokens revocados. La sesión actual queda invalidada en ~1 hora.`);

console.log(`\n✅ Acceso revocado completamente para ${email}.`);
console.log(`   Para reactivar (si fue por error): auth.updateUser('${user.uid}', { disabled: false })`);
