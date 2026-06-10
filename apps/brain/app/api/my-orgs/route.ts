import { NextResponse } from "next/server";
import { db, adminAuth } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);

    // users/{uid}.orgIds como índice, PERO verificando membresía real:
    // el array es escribible por el propio usuario via client SDK, así que
    // sin este check cualquiera podría listar nombres de orgs ajenas.
    const userSnap = await db.collection(COLLECTIONS.USERS).doc(decoded.uid).get();
    const data = userSnap.exists ? (userSnap.data() || {}) : {};
    const orgIds = Array.isArray(data.orgIds) ? data.orgIds.filter(Boolean) : [];

    const orgs = (
      await Promise.all(
        orgIds.map(async (orgId: string) => {
          const member = await db.collection(COLLECTIONS.ORGS).doc(orgId).collection("members").doc(decoded.uid).get();
          if (!member.exists) return null;
          const s = await db.collection(COLLECTIONS.ORGS).doc(orgId).get();
          return { id: orgId, name: s.exists ? (s.data()?.name ?? orgId) : orgId };
        })
      )
    ).filter((o): o is { id: string; name: string } => o !== null);

    return NextResponse.json({ uid: decoded.uid, orgs });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
