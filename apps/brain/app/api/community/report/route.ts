/**
 * API: POST /api/community/report
 *
 * Reporta un hilo o una respuesta para revisión del equipo. Cualquier usuario
 * autenticado. Un reporte por usuario y objeto (id determinista) → no infla el
 * contador con reportes repetidos. Incrementa reportCount del objeto (que solo
 * ve staff) y guarda el reporte en community_reports.
 * Body: { postId, answerId?, reason? }. Auth: requireAuth.
 */
import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";
import { LIMITS } from "@/lib/community";

export async function POST(req: Request) {
  try {
    const token = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as {
      postId?: string;
      answerId?: string;
      reason?: string;
    };

    const postId = body.postId ? String(body.postId) : "";
    const answerId = body.answerId ? String(body.answerId) : null;
    const reason = String(body.reason ?? "").trim().slice(0, LIMITS.BODY_MAX);
    if (!postId) return NextResponse.json({ error: "Falta el contenido a reportar" }, { status: 400 });

    const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const targetRef = answerId ? postRef.collection(COLLECTIONS.ANSWERS).doc(answerId) : postRef;
    const reportId = `${token.uid}__${postId}__${answerId ?? "post"}`;
    const reportRef = db.collection(COLLECTIONS.COMMUNITY_REPORTS).doc(reportId);

    const result = await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new AuthError("El contenido ya no existe", 404);

      const existing = await tx.get(reportRef);
      if (existing.exists) return { ok: true, already: true };

      tx.set(reportRef, {
        postId,
        answerId,
        reason,
        reporterUid: token.uid,
        createdAt: FieldValue.serverTimestamp(),
        resolved: false,
      });
      tx.update(targetRef, { reportCount: FieldValue.increment(1) });
      return { ok: true, already: false };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/report]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
