/**
 * backfill-loyalty-fields.mjs
 *
 * Añade campos de fidelidad a perfiles existentes que no los tengan.
 * Genera numericCode a partir del UID y establece puntos a 0.
 *
 * Uso:
 *   node scripts/backfill-loyalty-fields.mjs
 *
 * Opción --retroactive: calcula puntos retroactivos basados en totalSpent
 *   node scripts/backfill-loyalty-fields.mjs --retroactive
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Init Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS env var or default)
const app = initializeApp();
const db = getFirestore(app);

const retroactive = process.argv.includes("--retroactive");

function generateNumericCode(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash = hash & hash;
  }
  const code = Math.abs(hash) % 10000;
  return String(code).padStart(4, "0");
}

async function main() {
  console.log("🔄 Backfilling loyalty fields...");
  if (retroactive) console.log("   (retroactive mode: calculating points from totalSpent)");

  const snap = await db.collection("customer_profiles").get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Ya tiene campos de loyalty
    if (data.numericCode && data.loyaltyPoints !== undefined) {
      skipped++;
      continue;
    }

    const update = {};

    if (!data.numericCode) {
      update.numericCode = generateNumericCode(doc.id);
    }

    if (data.loyaltyPoints === undefined) {
      if (retroactive && data.totalSpent > 0) {
        const points = Math.floor((data.totalSpent || 0) * 100);
        update.loyaltyPoints = points;
        update.totalPointsEarned = points;
        update.pointsHistory = [{
          type: "POS",
          amount: points,
          transactionId: `backfill-${doc.id}`,
          earnedAt: new Date(),
          description: `Retroactivo: ${(data.totalSpent || 0).toFixed(2)}€ gastados`,
        }];
      } else {
        update.loyaltyPoints = 0;
        update.totalPointsEarned = 0;
        update.pointsHistory = [];
      }
    }

    if (Object.keys(update).length > 0) {
      await doc.ref.update(update);
      updated++;
      const code = update.numericCode || data.numericCode;
      const pts = update.loyaltyPoints ?? data.loyaltyPoints ?? 0;
      console.log(`  ✅ ${data.name || doc.id} → code: ${code}, pts: ${pts}`);
    }
  }

  console.log(`\n✨ Done. Updated: ${updated}, Skipped: ${skipped}, Total: ${snap.size}`);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
