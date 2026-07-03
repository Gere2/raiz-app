/**
 * API: GET /api/community/reports  (solo equipo)
 *
 * Cola de revisión de moderación: reportes sin resolver, agrupados por objeto
 * (hilo o respuesta) con el contenido reportado, el nº de reportes y las
 * razones. Excluye objetos ya ocultos (hidden). Auth: requireStaff.
 *
 * Sin índice compuesto: filtra resolved==false (igualdad, índice automático) y
 * ordena/agrupa en memoria.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, AuthError } from "@/lib/require-auth";
import type { CommunityReportGroup, Topic } from "@/lib/community";

const SCAN = 300;

export async function GET(req: Request) {
  try {
    // Mismo gate que el resto de moderación: claim staff:true.
    const token = await requireAuth(req);
    if (token.staff !== true) throw new AuthError("Solo el equipo puede revisar reportes", 403);

    const snap = await db
      .collection(COLLECTIONS.COMMUNITY_REPORTS)
      .where("resolved", "==", false)
      .limit(SCAN)
      .get();

    // Agrupa por objeto reportado.
    const groups = new Map<string, { postId: string; answerId: string | null; reasons: string[]; lastAt: number; count: number }>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const postId = d.postId as string;
      const answerId = (d.answerId as string) ?? null;
      if (!postId) continue;
      const key = `${postId}__${answerId ?? "post"}`;
      const at = d.createdAt?.toMillis?.() ?? 0;
      const g = groups.get(key) ?? { postId, answerId, reasons: [], lastAt: 0, count: 0 };
      g.count += 1;
      g.lastAt = Math.max(g.lastAt, at);
      if (d.reason) g.reasons.push(String(d.reason));
      groups.set(key, g);
    }

    // Resuelve el contenido de cada objeto (omite los ya ocultos).
    const reports: CommunityReportGroup[] = [];
    for (const [key, g] of groups) {
      const postRef = db.collection(COLLECTIONS.COMMUNITY_POSTS).doc(g.postId);
      const postSnap = await postRef.get();
      if (!postSnap.exists || postSnap.data()?.hidden === true) continue;
      const post = postSnap.data() ?? {};

      if (g.answerId) {
        const aSnap = await postRef.collection(COLLECTIONS.ANSWERS).doc(g.answerId).get();
        if (!aSnap.exists || aSnap.data()?.hidden === true) continue;
        const a = aSnap.data() ?? {};
        reports.push({
          key,
          postId: g.postId,
          answerId: g.answerId,
          targetType: "answer",
          title: post.title ?? "",
          excerpt: a.body ?? "",
          topic: (post.topic ?? "general") as Topic,
          authorName: a.authorName ?? "Un negocio de Enverde",
          reportCount: g.count,
          reasons: g.reasons,
          lastAt: g.lastAt || null,
        });
      } else {
        reports.push({
          key,
          postId: g.postId,
          answerId: null,
          targetType: "post",
          title: post.title ?? "",
          excerpt: post.body ?? "",
          topic: (post.topic ?? "general") as Topic,
          authorName: post.authorName ?? "Un negocio de Enverde",
          reportCount: g.count,
          reasons: g.reasons,
          lastAt: g.lastAt || null,
        });
      }
    }

    // Más reportados primero, luego lo más reciente.
    reports.sort((a, b) => (b.reportCount - a.reportCount) || ((b.lastAt ?? 0) - (a.lastAt ?? 0)));

    return NextResponse.json({ reports });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as { message?: string };
    console.error("[community/reports]", err?.message ?? e);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
