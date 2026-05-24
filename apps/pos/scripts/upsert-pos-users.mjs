import admin from "firebase-admin"
import fs from "fs"

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/raizygrano-admin.json"
if (!fs.existsSync(keyPath)) {
  console.error("No existe service account:", keyPath)
  process.exit(1)
}

const creds = JSON.parse(fs.readFileSync(keyPath, "utf8"))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) })
const db = admin.firestore()

// Uso:
// node scripts/upsert-pos-users.mjs cafe_users empleado1@correo.com aVQtKO2-MiIVGOBT vendedor
// node scripts/upsert-pos-users.mjs cafe_users empleado2@correo.com _y9vmVGCVXL-ls1y vendedor
// node scripts/upsert-pos-users.mjs cafe_users contrerasgeremi@gmail.com <PASS> admin

const [collectionName, email, pin, role] = process.argv.slice(2)
if (!collectionName || !email || !pin || !role) {
  console.error("Uso: node scripts/upsert-pos-users.mjs <coleccion> <email> <pin> <role>")
  process.exit(1)
}

const now = admin.firestore.FieldValue.serverTimestamp()

// id estable = email (para no duplicar docs)
const docId = email.toLowerCase()
const ref = db.collection(collectionName).doc(docId)

await ref.set(
  {
    id: docId,
    name: email,
    pin,
    role,
    createdAt: now,
    updatedAt: now,
    active: true,
  },
  { merge: true }
)

console.log("OK upsert:", collectionName, docId, { name: email, role })
process.exit(0)
