/**
 * Firebase Admin SDK — lazy singleton for POS
 *
 * Inicialización:
 *   1. Si GOOGLE_APPLICATION_CREDENTIALS apunta a tu JSON → usa applicationDefault()
 *   2. Si FIREBASE_ADMIN_JSON está en env → parsea y usa cert()
 */
import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _app = initializeApp({ credential: applicationDefault() });
    return _app;
  }

  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    const sa = JSON.parse(json);
    _app = initializeApp({ credential: cert(sa) });
    return _app;
  }

  throw new Error(
    "Firebase Admin: necesitas GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_ADMIN_JSON"
  );
}

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_, prop) {
    const firestore = getFirestore(getAdminApp());
    return (firestore as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_, prop) {
    const auth = getAuth(getAdminApp());
    return (auth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { FieldValue };
