/**
 * API: GET /api/community/notifications
 *
 * Devuelve las notificaciones de comunidad del usuario actual (respuestas a sus
 * hilos), más recientes primero, con el contador de no leídas.
 * Auth: requireAuth. Respuesta: { unread, items }.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";
import type { CommunityNotification } from "@/lib/community";

export async function GET(req: Request) {
  try {
    const token = await requireAuth(req);

    const snap = await db
      .collection(COLLECTIONS.USERS)
      .doc(token.uid)
      .collection(COLLECTIONS.COMMUNITY_NOTIFICATIONS)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const items: CommunityNotification[] = snap.docs.map((doc) => {
      const n = doc.data();
      return {
        id: doc.id,
        postId: n.postId ?? "",
        postTitle: n.postTitle ?? "",
        answerAuthorName: n.answerAuthorName ?? "Alguien",
        createdAt: n.createdAt?.toMillis?.() ?? null,
        read: n.read === true,
      };
    });

    const unread = items.filter((n) => !n.read).length;
    return NextResponse.json({ unread, items });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/notifications]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
