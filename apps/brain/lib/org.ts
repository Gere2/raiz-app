import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

export type Org = {
  id: string;
  name?: string;
};

/**
 * getMyOrgs — Retrieves orgs where user is a member.
 * Parallelizes member checks instead of sequential queries (N+1 fix).
 * Returns only whitelisted org fields (id, name).
 */
export async function getMyOrgs(uid: string): Promise<Org[]> {
  if (!uid) return [];

  // Get all orgs once
  const orgsSnap = await getDocs(collection(db, "orgs"));
  if (orgsSnap.empty) return [];

  // Batch all member checks in parallel instead of sequential N+1
  const checks = orgsSnap.docs.map(async (orgDoc) => {
    const memberRef = collection(db, "orgs", orgDoc.id, "members");
    const q = query(memberRef, where("__name__", "==", uid));
    const memberSnap = await getDocs(q);
    if (!memberSnap.empty) {
      const data = orgDoc.data();
      return { id: orgDoc.id, name: data.name } as Org;
    }
    return null;
  });

  const results = await Promise.all(checks);
  return results.filter((org): org is Org => org !== null);
}
