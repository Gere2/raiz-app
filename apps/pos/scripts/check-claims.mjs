import admin from "firebase-admin";
import fs from "fs";

const creds = JSON.parse(fs.readFileSync("./secrets/raizygrano-admin.json","utf8"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/check-claims.mjs email@dominio.com");
  process.exit(1);
}

const user = await admin.auth().getUserByEmail(email);
console.log("Email:", user.email);
console.log("UID:", user.uid);
console.log("Claims:", user.customClaims || {});
