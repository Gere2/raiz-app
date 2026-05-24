import "dotenv/config"
import { initializeApp, getApps } from "firebase/app"
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const db = getFirestore(app)

try {
  const snap = await getDocs(query(collection(db, "users"), limit(10)))
  console.log("users docs:", snap.size)
  snap.forEach((d) => console.log(d.id, d.data()))
} catch (e) {
  console.error("ERROR leyendo users:", e?.message || e)
  process.exit(1)
}
