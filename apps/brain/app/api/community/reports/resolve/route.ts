/**
 * API: POST /api/community/reports/resolve  (solo equipo)
 *
 * Descarta los reportes de un objeto (el contenido se queda visible): marca
 * resolved=true en todos sus reportes y pone reportCount=0 en el objeto, así
 * sale de la cola de revisión y desaparece el flag ⚑.
 * Body: { postId, answerId? }. Auth: requireStaff.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";

export async function POST(req: Request) {
  try {
    const token = await requireAuth(req);
    if (token.staff !== true) throw new AuthError("Solo el equipo puede resolver reportes", 403);
    const body = (await req.json().catch(() => ({}))) as { postId?: string; answerId?: string };
    const postId = body.postId ? String(body.postId) : "";
    const answerId = body.answerId ? String(body.answerId) : null;
    if (!postId) return NextResponse.json({ error: "Falta el objeto a resolver" }, { status: 400 });

    // Marca resueltos los reportes de este objeto (1 query por postId, filtro en memoria).
    const repSnap = await db.collection(COLLECTIONS.COMMUNITY_REPORTS).where("postId", "==", postId).get();
    const batch = db.batch();
    let marked = 0;
    repSnap.docs.forEach((d) => {
      const sameTarget = ((d.data().answerId as string) ?? null) === answerId;
      if (sameTarget && d.data().resolved !== true) {
        batch.update(d.ref, { resolved: true });
        marked++;
      }
    });

    // Limpia el contador en el objeto.
    const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const targetRef = answerId ? postRef.collection(COLLECTIONS.ANSWERS).doc(answerId) : postRef;
    batch.update(targetRef, { reportCount: 0 });

    await batch.commit();
    return NextResponse.json({ ok: true, marked });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/reports/resolve]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
