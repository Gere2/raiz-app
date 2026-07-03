/**
 * API: POST /api/community/notifications/read
 *
 * Marca como leídas todas las notificaciones de comunidad del usuario actual.
 * Auth: requireAuth. Respuesta: { marked }.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";

export async function POST(req: Request) {
  try {
    const token = await requireAuth(req);

    const col = db
      .collection(COLLECTIONS.USERS)
      .doc(token.uid)
      .collection(COLLECTIONS.COMMUNITY_NOTIFICATIONS);
    const snap = await col.where("read", "==", false).limit(400).get();

    if (snap.empty) return NextResponse.json({ marked: 0 });

    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();

    return NextResponse.json({ marked: snap.size });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/notifications/read]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
