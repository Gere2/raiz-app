/**
 * backfill-usertype-orders.mjs
 * Adds userType to existing orders by looking up customer_profiles.
 */
import admin from "firebase-admin"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("secrets/raizygrano-admin.json", "utf8"))
admin.initializeApp({ credential: admin.credential.cert(creds) })
const db = admin.firestore()

async function main() {
  // 1. Load all customer profiles into a map: uid -> userType
  const profilesSnap = await db.collection("customer_profiles").get()
  const profileMap = new Map()
  profilesSnap.forEach(doc => {
    const data = doc.data()
    if (data.userType) {
      profileMap.set(doc.id, data.userType)
    }
  })
  console.log(`Loaded ${profileMap.size} profiles with userType`)

  // 2. Get all orders
  const ordersSnap = await db.collection("orders").get()
  console.log(`Found ${ordersSnap.size} orders`)

  let updated = 0
  let skipped = 0
  let noProfile = 0

  for (const orderDoc of ordersSnap.docs) {
    const data = orderDoc.data()

    // Skip if already has userType
    if (data.userType) {
      skipped++
      continue
    }

    const uid = data.customerUid
    if (!uid || !profileMap.has(uid)) {
      noProfile++
      continue
    }

    await orderDoc.ref.update({ userType: profileMap.get(uid) })
    updated++
    console.log(`  ✅ ${orderDoc.id} → ${profileMap.get(uid)}`)
  }

  console.log(`\nDone: ${updated} updated, ${skipped} already had userType, ${noProfile} no profile found`)
}

main().catch(console.error)
