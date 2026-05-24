import admin from "firebase-admin";
import fs from "fs";

const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "./secrets/raizygrano-admin.json";

if (!fs.existsSync(keyPath)) {
  console.error("No existe GOOGLE_APPLICATION_CREDENTIALS ni:", keyPath);
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(keyPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

const email = process.argv[2];

if (!email) {
  console.log("Uso:");
  console.log("node scripts/set-staff-claim.mjs <email>");
  process.exit(0);
}

const user = await admin.auth().getUserByEmail(email);

await admin.auth().setCustomUserClaims(user.uid, { staff: true });

const again = await admin.auth().getUser(user.uid);

console.log("OK:");
console.log("Email:", again.email);
console.log("UID:", again.uid);
console.log("Claims:", again.customClaims);
