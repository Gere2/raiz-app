#!/usr/bin/env node
/**
 * Diagnóstico: muestra la estructura real de las colecciones POS en Firestore
 * 
 * Uso:
 *   cd ~/raiz-app/apps/brain
 *   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/raiz-app/apps/pos/secrets/raizygrano-admin.json"
 *   node scripts/inspect-pos-data.mjs
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) {
  console.error("❌ Falta GOOGLE_APPLICATION_CREDENTIALS");
  process.exit(1);
}

if (!getApps().length) {
  const sa = JSON.parse(fs.readFileSync(credsPath, "utf8"));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function inspectCollection(name, limit = 2) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📦 ${name}`);
  console.log("═".repeat(60));
  
  const snap = await db.collection(name).limit(limit).get();
  console.log(`   Total docs (muestra): ${snap.size}`);
  
  // Count total
  const allSnap = await db.collection(name).count().get();
  console.log(`   Total docs (real): ${allSnap.data().count}`);
  
  if (snap.empty) {
    console.log("   (vacía)");
    return;
  }
  
  snap.docs.forEach((doc, i) => {
    console.log(`\n   📄 Doc ${i + 1} (id: ${doc.id}):`);
    const data = doc.data();
    Object.entries(data).forEach(([key, val]) => {
      let display = val;
      if (val && typeof val === "object" && val.constructor?.name === "Timestamp") {
        display = `Timestamp(${val.toDate().toISOString()})`;
      } else if (typeof val === "object" && val !== null) {
        display = JSON.stringify(val, null, 2).substring(0, 200);
      }
      console.log(`      ${key}: ${display}`);
    });
  });
}

async function inspectSubcollections(parentPath, subName, limit = 1) {
  const parentSnap = await db.collection(parentPath).limit(1).get();
  if (parentSnap.empty) return;
  
  const parentDoc = parentSnap.docs[0];
  const subSnap = await db.collection(`${parentPath}/${parentDoc.id}/${subName}`).limit(limit).get();
  
  if (!subSnap.empty) {
    console.log(`\n   📁 Subcollection: ${parentPath}/{id}/${subName}`);
    subSnap.docs.forEach((doc, i) => {
      console.log(`      Doc (id: ${doc.id}):`);
      const data = doc.data();
      Object.entries(data).forEach(([key, val]) => {
        let display = val;
        if (val && typeof val === "object" && val.constructor?.name === "Timestamp") {
          display = `Timestamp(${val.toDate().toISOString()})`;
        } else if (typeof val === "object" && val !== null) {
          display = JSON.stringify(val, null, 2).substring(0, 200);
        }
        console.log(`         ${key}: ${display}`);
      });
    });
  }
}

console.log("🔍 Inspeccionando colecciones de Firestore...\n");

// Colecciones POS principales
await inspectCollection("products", 3);
await inspectCollection("categories", 4);
await inspectCollection("inventory", 3);
await inspectCollection("inventory_categories", 3);
await inspectCollection("inventory_movements", 2);

// Colecciones Brain
await inspectCollection("orgs", 1);
await inspectSubcollections("orgs", "catalog", 2);
await inspectSubcollections("orgs", "recipes", 2);

console.log("\n\n✅ Diagnóstico completo");
console.log("Copia toda esta salida y pégala en el chat con Claude.");
