/**
 * API: POST /api/community/posts/:postId/delete
 *
 * Borrado blando (hidden=true) de un hilo. Permitido al autor del hilo o a staff.
 * El contenido se conserva en Firestore pero desaparece de listados y detalle.
 * Auth: requireAuth.
 */
import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";

export async function POST(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const token = await requireAuth(req);
    const { postId } = await params;

    const ref = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "El hilo ya no existe" }, { status: 404 });

    const isAuthor = snap.data()?.authorUid === token.uid;
    if (!isAuthor && token.staff !== true) {
      return NextResponse.json({ error: "No puedes eliminar este contenido" }, { status: 403 });
    }

    await ref.update({
      hidden: true,
      hiddenBy: token.uid,
      hiddenByStaff: token.staff === true && !isAuthor,
      hiddenAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/posts/delete]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
