import admin from "firebase-admin";
import fs from "fs";
import crypto from "crypto";

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
  console.log("node scripts/create-staff-and-claim.mjs <email>");
  process.exit(0);
}

let user;
try {
  user = await admin.auth().getUserByEmail(email);
  console.log("Usuario ya existía en Auth:", email);
} catch (e) {
  if (e?.errorInfo?.code !== "auth/user-not-found") throw e;

  // password temporal fuerte
  const tempPassword = crypto.randomBytes(12).toString("base64url");

  user = await admin.auth().createUser({
    email,
    password: tempPassword,
    emailVerified: true,
  });

  console.log("✅ Usuario creado en Auth:", email);
  console.log("⚠️ Password temporal:", tempPassword);
  console.log("   (cámbiala luego desde tu UI o desde Firebase Console)");
}

await admin.auth().setCustomUserClaims(user.uid, { staff: true });

const again = await admin.auth().getUser(user.uid);

console.log("✅ Claim aplicado:");
console.log("Email:", again.email);
console.log("UID:", again.uid);
console.log("Claims:", again.customClaims);
