#!/usr/bin/env node
/**
 * Purga quirúrgica de orgs de prueba Enverde dejadas por la auditoría del flujo
 * (2026-06-05): el probe en vivo de /api/enverde/start provisionó 2 orgs huérfanas
 * en el brain. Este script las borra (org recursive + users/{uid} + Auth user),
 * SOLO si pasan las guardas de seguridad (source=enverde + email/orgId con patrón
 * de test). Dry-run por defecto; --apply para borrar de verdad.
 *
 *   node scripts/purge-enverde-test-orgs.mjs            # lista (dry-run)
 *   node scripts/purge-enverde-test-orgs.mjs --apply    # borra
 */
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const TARGET_ORG_IDS = [
  "audit-test-do-not-use-l6isnk",
  "totally-different-name-inc-9tfk27",
  "smoke-test-enverde-8azyia", // auditoría flujo post-activación (2026-06-08)
];
const TEST_RE = /(example\.com|audit|probe|do-not-use|totally-different|smoke-test-enverde)/i;

function loadEnvVar(file, key) {
  try {
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      const t = line.trim();
      if (t.startsWith(key + "=")) {
        let v = t.slice(key.length + 1);
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return v;
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

const adminJson = process.env.FIREBASE_ADMIN_JSON || loadEnvVar(".env.local", "FIREBASE_ADMIN_JSON");
if (!adminJson) {
  console.error("Falta FIREBASE_ADMIN_JSON (ni en env ni en .env.local). Corre desde apps/brain.");
  process.exit(1);
}
const sa = JSON.parse(adminJson);
if (!getApps().length) initializeApp({ credential: cert(sa) });

const db = getFirestore();
const auth = getAuth();

async function main() {
  console.log(`\n=== PURGE ENVERDE TEST ORGS (brain) — ${APPLY ? "APPLY (DESTRUCTIVO)" : "DRY-RUN"} ===`);
  console.log(`    proyecto: ${sa.project_id}\n`);

  for (const orgId of TARGET_ORG_IDS) {
    const uid = `enverde_${orgId}`;
    const ref = db.collection("orgs").doc(orgId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`· ${orgId}: NO existe (ya limpio) — skip`);
      continue;
    }
    const d = snap.data() || {};
    const created = d.createdAt?.toDate?.()?.toISOString?.() ?? "?";
    console.log(`· ${orgId}`);
    console.log(`    name="${d.name}"  email="${d.email}"  source="${d.source}"  created=${created}`);

    // Guardas de seguridad: solo borra si es claramente dato de test.
    const looksTest =
      d.source === "enverde" &&
      TEST_RE.test(String(d.email ?? "")) &&
      TEST_RE.test(orgId);
    if (!looksTest) {
      console.log(`    ⚠️  NO parece dato de test (source/email/orgId no matchean) — ABORTO este org por seguridad`);
      continue;
    }

    if (!APPLY) {
      console.log(`    [dry-run] borraría: orgs/${orgId} (recursive) + users/${uid} + Auth user ${uid}`);
      continue;
    }

    await db.recursiveDelete(ref); // org + members + treasury_assumptions + cualquier subcol
    console.log(`    ✓ orgs/${orgId} (recursive) borrado`);
    try {
      await db.collection("users").doc(uid).delete();
      console.log(`    ✓ users/${uid} borrado`);
    } catch (e) {
      console.log(`    · users/${uid}: ${e.message}`);
    }
    try {
      await auth.deleteUser(uid);
      console.log(`    ✓ Auth user ${uid} borrado`);
    } catch (e) {
      console.log(`    · Auth ${uid}: ${e.message} (normal si nunca hizo signIn)`);
    }
  }
  console.log("\nListo.\n");
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
