import admin from "firebase-admin";
import fs from "fs";
const creds = JSON.parse(fs.readFileSync("./secrets/raizygrano-admin.json","utf8"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });
const snap = await admin.firestore().collection("tickets").orderBy("ticketNumber","desc").limit(1).get();
snap.forEach(d => console.log(JSON.stringify(d.data(), null, 2)));
process.exit(0);
