/**
 * API: POST /api/community/posts/:postId/answers
 *
 * Añade una respuesta a una pregunta del foro. Cualquier café registrado
 * (firma con su nombre) o el equipo (badge staff) puede responder.
 * Body: { body, orgId? }. Auth: requireAuth.
 */
import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, requireOrgMember, AuthError } from "@/lib/require-auth";
import { LIMITS } from "@/lib/community";

export async function POST(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const token = await requireAuth(req);
    const { postId } = await params;
    const body = (await req.json().catch(() => ({}))) as { body?: string; orgId?: string };

    const text = String(body.body ?? "").trim().slice(0, LIMITS.ANSWER_MAX);
    if (!text) return NextResponse.json({ error: "La respuesta no puede estar vacía" }, { status: 400 });

    const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return NextResponse.json({ error: "Esta conversación ya no existe" }, { status: 404 });
    }

    // Identidad: si manda orgId y es miembro, firma con el negocio; si no,
    // solo el equipo (staff) puede responder en nombre de Enverde.
    const orgId = body.orgId ? String(body.orgId) : null;
    let authorName: string;
    let authorOrgId: string | null = null;
    let isStaff = false;

    if (orgId) {
      await requireOrgMember(req, orgId);
      authorOrgId = orgId;
      const s = await db.collection(COLLECTIONS.ORGS).doc(orgId).get();
      authorName = (s.exists && (s.data()?.name as string)) || "Un negocio de Enverde";
      isStaff = token.staff === true;
    } else if (token.staff === true) {
      authorName = "Equipo Enverde";
      isStaff = true;
    } else {
      return NextResponse.json({ error: "Falta la organización" }, { status: 400 });
    }

    const ansRef = await postRef.collection(COLLECTIONS.ANSWERS).add({
      body: text,
      authorUid: token.uid,
      authorOrgId,
      authorName,
      isStaff,
      upvotes: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postRef.update({ answerCount: FieldValue.increment(1) });

    // Notifica al autor del hilo (si es un usuario real y no es quien responde).
    const post = postSnap.data() ?? {};
    const postAuthorUid: string | undefined = post.authorUid;
    if (postAuthorUid && postAuthorUid !== token.uid && postAuthorUid !== "enverde-team") {
      await db
        .collection(COLLECTIONS.USERS)
        .doc(postAuthorUid)
        .collection(COLLECTIONS.COMMUNITY_NOTIFICATIONS)
        .add({
          postId,
          postTitle: post.title ?? "",
          answerAuthorName: authorName,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
    }

    return NextResponse.json({ id: ansRef.id }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/answers]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
