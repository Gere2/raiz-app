/**
 * API: POST /api/community/posts/:postId/answers/:answerId/delete
 *
 * Borrado blando (hidden=true) de una respuesta. Autor de la respuesta o staff.
 * Decrementa answerCount del hilo para mantener el contador visible coherente.
 * Auth: requireAuth.
 */
import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string; answerId: string }> }
) {
  try {
    const token = await requireAuth(req);
    const { postId, answerId } = await params;

    const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const ansRef = postRef.collection(COLLECTIONS.ANSWERS).doc(answerId);
    const snap = await ansRef.get();
    if (!snap.exists) return NextResponse.json({ error: "La respuesta ya no existe" }, { status: 404 });
    if (snap.data()?.hidden === true) return NextResponse.json({ ok: true }); // ya oculta

    const isAuthor = snap.data()?.authorUid === token.uid;
    if (!isAuthor && token.staff !== true) {
      return NextResponse.json({ error: "No puedes eliminar este contenido" }, { status: 403 });
    }

    await ansRef.update({
      hidden: true,
      hiddenBy: token.uid,
      hiddenByStaff: token.staff === true && !isAuthor,
      hiddenAt: FieldValue.serverTimestamp(),
    });
    await postRef.update({ answerCount: FieldValue.increment(-1) });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/answers/delete]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
