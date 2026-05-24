#!/usr/bin/env node
/**
 * Crea un usuario Firebase Auth + lo añade como member con role "viewer"
 * a una organización de raiz-app.
 *
 * Diseñado específicamente para dar a las vendedoras de La Singularidad
 * acceso de SOLO LECTURA al brain de Raíz (para abrir el panel Treasury
 * en el móvil durante demos a cafeterías de especialidad).
 *
 *   node scripts/create-viewer-user.mjs <orgId> <email> [password]
 *
 *   - orgId:    p.ej. "raiz-y-grano" (mira con scripts/list-orgs.mjs si no lo sabes)
 *   - email:    vendedora1@lasinguralidad.com
 *   - password: opcional. Si no se pasa, se genera uno seguro y se imprime.
 *
 * Requisitos:
 *   - `gcloud auth application-default login` en la terminal (raizygrano proyecto)
 *   - Permisos de admin en el proyecto Firebase
 *
 * IMPORTANTE — limitación actual de seguridad:
 *   El role "viewer" NO está enforced en los endpoints de raiz-app a día de
 *   hoy: un usuario viewer puede llamar APIs de escritura por API si supiera
 *   las rutas. Para la vendedora (uso de buena fe, solo demo desde la UI)
 *   es aceptable, pero NO compartas estas credenciales con terceros.
 *   Roadmap: añadir guard `requireWriteAccess()` que rechace role==="viewer".
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomBytes } from "crypto";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

const [, , orgId, email, passwordArg] = process.argv;

if (!orgId || !email) {
  console.log("Uso: node scripts/create-viewer-user.mjs <orgId> <email> [password]");
  console.log("");
  console.log("Ejemplo:");
  console.log("  node scripts/create-viewer-user.mjs raiz-y-grano vendedora1@lasinguralidad.com");
  process.exit(1);
}

// Si no pasan password, generamos una segura (12 chars, alfanumérica + símbolos seguros).
function generatePassword() {
  const bytes = randomBytes(16);
  return bytes
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 14) + "x9!";
}

const password = passwordArg || generatePassword();

// 1) Verificar que la org existe.
const orgSnap = await db.collection("orgs").doc(orgId).get();
if (!orgSnap.exists) {
  console.error(`❌ Org '${orgId}' no existe. Lista las orgs disponibles con:`);
  console.error("   node scripts/list-orgs.mjs");
  process.exit(1);
}
console.log(`✓ Org encontrada: ${orgId} (${orgSnap.data().name || "sin nombre"})`);

// 2) ¿Existe ya el usuario en Firebase Auth?
let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`✓ Usuario ya existe en Auth: ${user.uid}`);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  user = await auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: email.split("@")[0],
  });
  console.log(`✓ Usuario creado en Auth: ${user.uid}`);
}

// 3) Añadir/actualizar membership con role viewer.
await db
  .collection("orgs")
  .doc(orgId)
  .collection("members")
  .doc(user.uid)
  .set(
    {
      uid: user.uid,
      email,
      role: "viewer",
      createdAt: new Date(),
      notes: "Vendedora La Singularidad — acceso solo demo, NO compartir credenciales.",
    },
    { merge: true },
  );

// 4) Índice rápido en users/{uid}.
await db.collection("users").doc(user.uid).set(
  {
    uid: user.uid,
    email,
    orgIds: [orgId],
    updatedAt: new Date(),
  },
  { merge: true },
);

console.log("\n═══════════════════════════════════════════════════════");
console.log("✅ USUARIO VIEWER CREADO");
console.log("═══════════════════════════════════════════════════════");
console.log("  Email:    ", email);
console.log("  Password: ", password);
console.log("  UID:      ", user.uid);
console.log("  Org:      ", orgId);
console.log("  Role:     ", "viewer");
console.log("═══════════════════════════════════════════════════════");
console.log("\nLa vendedora puede ahora hacer login en raiz-app:");
console.log("  → URL del brain de Raíz");
console.log("  → email + password de arriba");
console.log("  → debe ir DIRECTAMENTE a TreasurySection");
console.log("\n⚠️  Limitación: el role 'viewer' no está enforced en endpoints.");
console.log("    NO compartir estas credenciales con terceros.");
console.log("    Si se filtra, ejecuta scripts/revoke-viewer.mjs para deshabilitar.\n");
