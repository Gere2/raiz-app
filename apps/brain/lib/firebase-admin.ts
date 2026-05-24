/**
 * Firebase Admin SDK — lazy singleton
 *
 * Inicialización diferida para evitar fallos durante el build de Vercel.
 * Solo se inicializa cuando una API route lo necesita, no al importar.
 *
 * Inicialización:
 *   1. Si GOOGLE_APPLICATION_CREDENTIALS apunta a tu JSON → usa applicationDefault()
 *   2. Si FIREBASE_ADMIN_JSON está en .env.local → parsea y usa cert()
 *
 * Exporta: db (Firestore), adminAuth (Auth), FieldValue
 */
import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _app: App | null = null;
let _firestore: Firestore | null = null;
let _auth: Auth | null = null;

function getAdminApp(): App {
  // getApps() es la fuente de verdad — sobrevive a HMR de Turbopack.
  // El cache local _app es solo para evitar el array lookup en hot paths.
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }
  if (_app) return _app;

  // Opción A: GOOGLE_APPLICATION_CREDENTIALS (recomendado en local)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _app = initializeApp({ credential: applicationDefault() });
    return _app;
  }

  // Opción B: JSON inline en .env.local (útil en Vercel)
  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    let sa;
    try {
      sa = JSON.parse(json);
    } catch {
      throw new Error("Firebase Admin: FIREBASE_ADMIN_JSON contiene JSON inválido. Verifica el formato.");
    }
    _app = initializeApp({ credential: cert(sa) });
    return _app;
  }

  throw new Error(
    "Firebase Admin: necesitas GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_ADMIN_JSON en .env.local"
  );
}

function getDb(): Firestore {
  if (_firestore) return _firestore;
  _firestore = getFirestore(getAdminApp());
  return _firestore;
}

function getAdminAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getAdminApp());
  return _auth;
}

// Proxy objects that initialize lazily on first access.
// Bindeamos métodos a su instancia para sobrevivir al desacople que aplica
// Turbopack al re-instrumentar @google-cloud/firestore en HMR.
export const db = new Proxy({} as Firestore, {
  get(_, prop) {
    const firestore = getDb();
    const value = (firestore as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(firestore) : value;
  },
});

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAdminAuth();
    const value = (auth as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(auth) : value;
  },
});

export { FieldValue };
