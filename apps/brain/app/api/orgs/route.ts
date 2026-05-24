import { NextResponse } from "next/server";
import { db, adminAuth } from "@/lib/firebase-admin";

async function requireUid(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw Object.assign(new Error("Missing token"), { status: 401 });

  const decoded = await adminAuth.verifyIdToken(token);
  return { uid: decoded.uid };
}

export async function GET(req: Request) {
  try {
    const { uid } = await requireUid(req);

    const userSnap = await db.collection("users").doc(uid).get();
    const data = userSnap.exists ? (userSnap.data() || {}) : {};
    const orgIds = Array.isArray(data.orgIds) ? data.orgIds.filter(Boolean) : [];

    const orgs = await Promise.all(
      orgIds.map(async (orgId: string) => {
        const s = await db.collection("orgs").doc(orgId).get();
        return { id: orgId, name: s.exists ? (s.data()?.name ?? orgId) : orgId };
      })
    );

    return NextResponse.json({ uid, orgs });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await requireUid(req);

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.orgId || "").trim();
    const name = String(body.name || "").trim();

    if (!orgId || !name) {
      return NextResponse.json({ error: "orgId y name son obligatorios" }, { status: 400 });
    }

    const orgRef = db.collection("orgs").doc(orgId);
    const memberRef = orgRef.collection("members").doc(uid);
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const user = userSnap.exists ? (userSnap.data() || {}) : {};
      const prev = Array.isArray(user.orgIds) ? user.orgIds : [];

      // Rate limiting: max 3 orgs per user
      if (prev.length >= 3) {
        throw Object.assign(new Error("Maximum 3 organizations per user"), { status: 429 });
      }

      tx.set(orgRef, { id: orgId, name, createdAt: new Date() }, { merge: true });
      tx.set(memberRef, { uid, role: "owner", createdAt: new Date() }, { merge: true });

      const next = Array.from(new Set([...prev, orgId]));
      tx.set(userRef, { uid, orgIds: next, updatedAt: new Date() }, { merge: true });
    });

    return NextResponse.json({ ok: true, orgId, name });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
