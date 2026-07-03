/**
 * API: GET /api/community/posts/:postId
 *
 * Devuelve el post + sus respuestas (orden cronológico ascendente).
 * Foro global. Auth: requireAuth.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";
import type { CommunityAnswer, CommunityPost } from "@/lib/community";

export async function GET(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const token = await requireAuth(req);
    const { postId } = await params;

    const staff = token.staff === true;
    const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const postSnap = await postRef.get();
    // Post inexistente o moderado (hidden) → 404 para todos.
    if (!postSnap.exists || postSnap.data()?.hidden === true) {
      return NextResponse.json({ error: "Esta conversación ya no existe" }, { status: 404 });
    }

    const d = postSnap.data() ?? {};
    const post: CommunityPost = {
      id: postSnap.id,
      type: d.type === "announcement" ? "announcement" : "question",
      topic: d.topic ?? "general",
      title: d.title ?? "",
      body: d.body ?? "",
      authorUid: d.authorUid ?? "",
      authorOrgId: d.authorOrgId ?? null,
      authorName: d.authorName ?? "Un negocio de Enverde",
      createdAt: d.createdAt?.toMillis?.() ?? null,
      answerCount: typeof d.answerCount === "number" ? d.answerCount : 0,
      pinned: d.pinned === true,
      status: d.status === "resolved" ? "resolved" : "open",
      reportCount: staff ? (typeof d.reportCount === "number" ? d.reportCount : 0) : undefined,
    };

    const ansSnap = await postRef.collection(COLLECTIONS.ANSWERS).orderBy("createdAt", "asc").get();
    const answers: CommunityAnswer[] = await Promise.all(
      ansSnap.docs
        .filter((doc) => doc.data().hidden !== true) // respuestas moderadas fuera
        .map(async (doc) => {
          const a = doc.data();
          const voteDoc = await doc.ref.collection(COLLECTIONS.VOTES).doc(token.uid).get();
          return {
            id: doc.id,
            body: a.body ?? "",
            authorUid: a.authorUid ?? "",
            authorOrgId: a.authorOrgId ?? null,
            authorName: a.authorName ?? "Un negocio de Enverde",
            isStaff: a.isStaff === true,
            createdAt: a.createdAt?.toMillis?.() ?? null,
            upvotes: typeof a.upvotes === "number" ? a.upvotes : 0,
            voted: voteDoc.exists,
            reportCount: staff ? (typeof a.reportCount === "number" ? a.reportCount : 0) : undefined,
          };
        })
    );

    // Mejores respuestas primero (más votadas), luego por antigüedad.
    answers.sort((x, y) => (y.upvotes - x.upvotes) || ((x.createdAt ?? 0) - (y.createdAt ?? 0)));

    return NextResponse.json({ post, answers });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/posts/:id]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
