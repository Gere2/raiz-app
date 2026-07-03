/**
 * API: /api/community/posts
 *
 *   GET  → lista de posts (novedades + preguntas), más recientes primero.
 *          Filtro opcional ?topic= y ?type= y ?limit=. El filtro se aplica en
 *          memoria sobre los últimos N para no requerir índices compuestos.
 *   POST → crea una pregunta (cualquier café registrado) o una novedad
 *          (solo staff). Body: { type, topic, title, body, orgId }.
 *
 * Foro GLOBAL (no org-scoped). Auth: requireAuth; las preguntas verifican
 * membresía de la org para firmar con el nombre del negocio.
 */
import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/firebase-collections";
import { requireAuth, requireOrgMember, AuthError } from "@/lib/require-auth";
import { isTopic, LIMITS, type CommunityPost } from "@/lib/community";

const FETCH_CAP = 200;

function serializePost(id: string, d: FirebaseFirestore.DocumentData, includeReports = false): CommunityPost {
  return {
    id,
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
    // reportCount solo para staff (moderación); se omite del JSON si no.
    reportCount: includeReports ? (typeof d.reportCount === "number" ? d.reportCount : 0) : undefined,
  };
}

export async function GET(req: Request) {
  try {
    const token = await requireAuth(req);
    const staff = token.staff === true;

    const url = new URL(req.url);
    const topic = url.searchParams.get("topic");
    const type = url.searchParams.get("type");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "60", 10) || 60, FETCH_CAP);

    // orderBy de un solo campo → índice automático, sin índice compuesto.
    const snap = await db
      .collection(COLLECTIONS.COMMUNITY_POSTS)
      .orderBy("createdAt", "desc")
      .limit(FETCH_CAP)
      .get();

    // Oculta el contenido moderado (hidden) para todos, incluido staff.
    let posts = snap.docs
      .filter((doc) => doc.data().hidden !== true)
      .map((doc) => serializePost(doc.id, doc.data(), staff));
    if (topic && topic !== "all" && isTopic(topic)) posts = posts.filter((p) => p.topic === topic);
    if (type === "question" || type === "announcement") posts = posts.filter((p) => p.type === type);

    // Novedades fijadas primero, luego por fecha.
    posts.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    return NextResponse.json({ posts: posts.slice(0, limit) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const token = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      topic?: string;
      title?: string;
      body?: string;
      orgId?: string;
    };

    const type = body.type === "announcement" ? "announcement" : "question";
    const topic = isTopic(body.topic) ? body.topic : "general";
    const title = String(body.title ?? "").trim().slice(0, LIMITS.TITLE_MAX);
    const text = String(body.body ?? "").trim().slice(0, LIMITS.BODY_MAX);
    const orgId = body.orgId ? String(body.orgId) : null;

    if (!title) return NextResponse.json({ error: "El título no puede estar vacío" }, { status: 400 });

    let authorName: string;
    let authorOrgId: string | null = null;

    if (type === "announcement") {
      // Las novedades (nuevas funcionalidades) solo las publica el equipo.
      if (token.staff !== true) {
        return NextResponse.json({ error: "Solo el equipo puede publicar novedades" }, { status: 403 });
      }
      authorName = "Equipo Enverde";
    } else {
      // Preguntas: cualquier negocio registrado, firmadas con su nombre.
      if (!orgId) return NextResponse.json({ error: "Falta la organización" }, { status: 400 });
      await requireOrgMember(req, orgId);
      authorOrgId = orgId;
      authorName = await orgName(orgId);
      if (!text) return NextResponse.json({ error: "Cuéntanos un poco más en el cuerpo" }, { status: 400 });
    }

    const ref = await db.collection(COLLECTIONS.COMMUNITY_POSTS).add({
      type,
      topic,
      title,
      body: text,
      authorUid: token.uid,
      authorOrgId,
      authorName,
      createdAt: FieldValue.serverTimestamp(),
      answerCount: 0,
      pinned: type === "announcement",
      status: "open",
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

async function orgName(orgId: string): Promise<string> {
  const s = await db.collection(COLLECTIONS.ORGS).doc(orgId).get();
  return (s.exists && (s.data()?.name as string)) || "Un negocio de Enverde";
}

function errorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  const err = e as { message?: string };
  console.error("[community/posts]", err?.message ?? e);
  return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
}
