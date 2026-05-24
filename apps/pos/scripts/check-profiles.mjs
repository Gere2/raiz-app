import admin from "firebase-admin";
import { readFileSync } from "fs";
const creds = JSON.parse(readFileSync("secrets/raizygrano-admin.json","utf8"));
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

const profiles = await db.collection("customer_profiles").get();
console.log("=== PROFILES ===");
profiles.forEach(d => console.log(d.id, d.data().userType || "NO userType", d.data().email || ""));

const orders = await db.collection("orders").limit(5).get();
console.log("\n=== SAMPLE ORDERS (customerUid) ===");
orders.forEach(d => console.log(d.id, d.data().customerUid || "NO UID"));
