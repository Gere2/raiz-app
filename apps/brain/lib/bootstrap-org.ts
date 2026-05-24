import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Bootstrap an organization for a user.
 * Creates the org document and adds the user as owner.
 *
 * @param uid - Firebase user ID
 * @param orgId - Organization ID (slug)
 * @param orgName - Display name for the organization
 */
export async function bootstrapOrg(uid: string, orgId: string, orgName: string) {
  await setDoc(
    doc(db, "orgs", orgId),
    {
      name: orgName,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "orgs", orgId, "members", uid),
    {
      role: "owner",
      active: true,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}
