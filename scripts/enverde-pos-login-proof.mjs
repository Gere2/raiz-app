/**
 * enverde-pos-login-proof.mjs
 *
 * Valida el handoff de identidad brain → POS (custom token) headless:
 *   1. Provisiona un café sandbox tal como la provisión ARREGLADA: orgs/{id} +
 *      members/{uid} + users/{uid}.orgIds=[id].
 *   2. Acuña un custom token (como /api/enverde/pos-login) para uid=enverde_<id>.
 *   3. Lo CANJEA de verdad contra la REST API de Firebase Auth con la API key del
 *      POS (mismo proyecto raizygrano) → prueba que el token es válido y exchangeable.
 *   4. Verifica que el idToken lleva el claim orgId, y que users/{uid}.orgIds resuelve
 *      (lo que usaría /api/my-orgs del POS).
 *   5. Limpia.
 *
 * La parte de UI (signInWithToken siembra cafeUser + redirect + carga de carta) queda
 * cubierta por tsc + revisión; esto valida el mecanismo Firebase, que es lo novedoso.
 *
 * Run desde la raíz de raiz-app:  node scripts/enverde-pos-login-proof.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

const sa = JSON.parse(readFileSync("apps/pos/secrets/raizygrano-admin.json", "utf-8"));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();
const adminAuth = getAuth();

// API key del POS (NEXT_PUBLIC_FIREBASE_API_KEY)
const env = readFileSync("apps/pos/.env.local", "utf-8");
const API_KEY = (env.match(/NEXT_PUBLIC_FIREBASE_API_KEY=("?)([^"\n\r]+)\1/) || [])[2];

const SANDBOX = "enverde-poslogin-proof";
const UID = `enverde_${SANDBOX}`;
const log = (...a) => console.log(...a);

async function cleanup() {
  const orgRef = db.collection("orgs").doc(SANDBOX);
  for (const sub of ["members"]) {
    const s = await orgRef.collection(sub).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await orgRef.delete().catch(() => {});
  await db.collection("users").doc(UID).delete().catch(() => {});
  try { await adminAuth.deleteUser(UID); } catch {}
}

(async () => {
  log("\n══════ PRUEBA: handoff de login enverde → POS (custom token) ══════\n");
  if (!API_KEY) { console.error("No encontré NEXT_PUBLIC_FIREBASE_API_KEY"); process.exit(1); }

  await cleanup(); // defensivo

  // 1) Provisión ARREGLADA: members + users.orgIds
  log("1) Provisionando sandbox (members + users.orgIds, como la provisión arreglada)…");
  const orgRef = db.collection("orgs").doc(SANDBOX);
  await orgRef.set({ name: "Café POS-login proof", source: "enverde", createdAt: new Date() }, { merge: true });
  await orgRef.collection("members").doc(UID).set({ role: "owner", active: true, source: "enverde" }, { merge: true });
  await db.collection("users").doc(UID).set({ uid: UID, orgIds: [SANDBOX] }, { merge: true });
  log(`   ✓ orgs/${SANDBOX} + members/${UID} + users/${UID}.orgIds=[${SANDBOX}]\n`);

  // 2) Acuñar custom token (como /api/enverde/pos-login)
  log("2) Acuñando custom token (claims {enverde, orgId})…");
  const customToken = await adminAuth.createCustomToken(UID, { enverde: true, orgId: SANDBOX });
  log(`   ✓ token acuñado (${customToken.length} chars)\n`);

  // 3) Canjearlo vía REST (lo que hace signInWithCustomToken del POS)
  log("3) Canjeando el token vía REST de Firebase Auth (API key del POS)…");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const data = await res.json();
  if (!res.ok || !data.idToken) {
    console.error("   ❌ canje falló:", JSON.stringify(data).slice(0, 300));
    await cleanup();
    process.exit(1);
  }
  // Decodificar payload del idToken (sin verificar firma; solo inspección)
  const payload = JSON.parse(Buffer.from(data.idToken.split(".")[1], "base64").toString("utf-8"));
  log(`   ✓ canjeado → idToken válido. uid=${payload.user_id || payload.sub}`);
  log(`     claims: enverde=${payload.enverde}  orgId=${payload.orgId}\n`);

  // 4) Verificar resolución de org (lo que usaría /api/my-orgs del POS)
  const usnap = await db.collection("users").doc(UID).get();
  const orgIds = usnap.data()?.orgIds || [];
  log("4) Resolución de org en el POS (/api/my-orgs lee users.orgIds):");
  log(`   users/${UID}.orgIds = ${JSON.stringify(orgIds)}\n`);

  const ok =
    !!data.idToken &&
    (payload.user_id === UID || payload.sub === UID) &&
    payload.orgId === SANDBOX &&
    Array.isArray(orgIds) && orgIds.includes(SANDBOX);

  log("5) Limpiando…");
  await cleanup();
  log("   ✓ sandbox eliminado\n");

  log(ok
    ? "RESULTADO: ✅ el café enverde puede canjear su token en el POS y resolver su org. Handoff válido."
    : "RESULTADO: ⚠️ revisar (ver claims/orgIds arriba).");
  process.exit(ok ? 0 : 1);
})().catch(async (e) => { console.error("ERROR:", e); try { await cleanup(); } catch {} process.exit(1); });
