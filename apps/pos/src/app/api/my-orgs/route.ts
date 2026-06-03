import { NextResponse } from "next/server";
import { db, adminAuth } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);

    // SOLO fuente de verdad: users/{uid}.orgIds
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const data = userSnap.exists ? (userSnap.data() || {}) : {};
    const orgIds = Array.isArray(data.orgIds) ? data.orgIds.filter(Boolean) : [];

    // Assert defensivo orgIds ↔ members: un orgId stale en el users doc NO debe
    // listar una org de la que el usuario ya no es miembro. La fuente de verdad
    // del acceso es orgs/{id}/members/{uid} (igual que requireOrgMember).
    const resolved = await Promise.all(
      orgIds.map(async (orgId: string) => {
        const [orgSnap, memberSnap] = await Promise.all([
          db.collection("orgs").doc(orgId).get(),
          db.collection("orgs").doc(orgId).collection("members").doc(decoded.uid).get(),
        ]);
        if (!memberSnap.exists) {
          console.warn(`[my-orgs] orgId ${orgId} en users/${decoded.uid}.orgIds sin member doc — omitido`);
          return null;
        }
        return { id: orgId, name: orgSnap.exists ? (orgSnap.data()?.name ?? orgId) : orgId };
      })
    );
    const orgs = resolved.filter((o): o is { id: string; name: string } => o !== null);

    return NextResponse.json({ uid: decoded.uid, orgs });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
