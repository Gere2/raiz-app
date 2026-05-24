import fs from "fs"
import admin from "firebase-admin"
import path from "path"

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? process.env.GOOGLE_APPLICATION_CREDENTIALS
  : path.resolve("./secrets/raizygrano-admin.json")

if (!fs.existsSync(keyPath)) {
  console.error("No existe:", keyPath)
  process.exit(1)
}

const raw = fs.readFileSync(keyPath, "utf8")
const creds = JSON.parse(raw)

if (!creds.project_id) {
  console.error("El JSON no parece service account válido (falta project_id).")
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  })
}

const db = admin.firestore()

const snap = await db.collection("tickets").limit(1000).get()
let missing = 0

snap.forEach((d) => {
  const data = d.data()
  if (!data.createdAt) missing++
})

console.log("Project:", creds.project_id)
console.log("Tickets leídos:", snap.size)
console.log("Sin createdAt:", missing)
