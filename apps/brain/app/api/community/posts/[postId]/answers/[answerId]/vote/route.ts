/**
 * API: POST /api/community/posts/:postId/answers/:answerId/vote
 *
 * Alterna el voto (upvote) del usuario sobre una respuesta. Un voto por usuario:
 * el voto vive en .../answers/{answerId}/votes/{uid} y el contador agregado en
 * answer.upvotes. Transacción para mantenerlos consistentes.
 * Auth: requireAuth. Devuelve { upvotes, voted }.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string; answerId: string }> }
) {
  try {
    const token = await requireAuth(req);
    const { postId, answerId } = await params;

    const answerRef = db
      .collection(COLLECTIONS.COMMUNITY_POSTS)
      .doc(postId)
      .collection(COLLECTIONS.ANSWERS)
      .doc(answerId);
    const voteRef = answerRef.collection(COLLECTIONS.VOTES).doc(token.uid);

    const result = await db.runTransaction(async (tx) => {
      const answerSnap = await tx.get(answerRef);
      if (!answerSnap.exists) throw new AuthError("La respuesta ya no existe", 404);

      const voteSnap = await tx.get(voteRef);
      const current = typeof answerSnap.data()?.upvotes === "number" ? answerSnap.data()!.upvotes : 0;

      if (voteSnap.exists) {
        tx.delete(voteRef);
        const upvotes = Math.max(0, current - 1);
        tx.update(answerRef, { upvotes });
        return { upvotes, voted: false };
      } else {
        tx.set(voteRef, { createdAt: Date.now() });
        const upvotes = current + 1;
        tx.update(answerRef, { upvotes });
        return { upvotes, voted: true };
      }
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/vote]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
