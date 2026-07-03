"use client";

/**
 * /org/[orgId]/comunidad — Foro de la comunidad Enverde
 *
 * La comunidad es global (compartida entre todos los cafés/bares/restaurantes).
 * Dos cosas viven aquí:
 *   - Novedades: nuevas funcionalidades que publica el equipo (Equipo Enverde).
 *   - Preguntas: los negocios se preguntan cosas entre sí, por topic.
 *
 * Self-contained igual que el resto del brain: auth propia
 * (onAuthStateChanged) + authedFetch a las API routes /api/community/*.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";
import {
  TOPICS,
  topicEmoji,
  topicLabel,
  LIMITS,
  type CommunityAnswer,
  type CommunityPost,
  type PostType,
  type Topic,
} from "@/lib/community";

const ACCENT = "#3F6B2E";
type TabId = "all" | Topic;

export default function ComunidadPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        try {
          const res = await u.getIdTokenResult();
          setIsStaff(res.claims?.staff === true);
        } catch {
          setIsStaff(false);
        }
      }
    });
    return () => unsub();
  }, []);

  const loadPosts = useCallback(async () => {
    if (!user) return;
    try {
      const r = await authedFetch(user, `/api/community/posts?limit=80`);
      const d = (await r.json().catch(() => ({}))) as { posts?: CommunityPost[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? "No pudimos cargar la comunidad");
      setPosts(d.posts ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No pudimos cargar la comunidad");
    }
  }, [user]);

  useEffect(() => {
    if (user) loadPosts();
  }, [user, loadPosts]);

  // Al entrar a la comunidad, da por leídas las notificaciones de respuestas.
  useEffect(() => {
    if (user) authedFetch(user, `/api/community/notifications/read`, { method: "POST" }).catch(() => {});
  }, [user]);

  const announcements = useMemo(() => (posts ?? []).filter((p) => p.type === "announcement"), [posts]);
  const questions = useMemo(() => {
    let qs = (posts ?? []).filter((p) => p.type === "question");
    if (tab !== "all") qs = qs.filter((p) => p.topic === tab);
    return qs;
  }, [posts, tab]);

  if (!authReady) return <Centered>Cargando…</Centered>;
  if (!user) {
    return (
      <Centered>
        <p className="text-lg font-medium">Tu sesión no está activa.</p>
        <a href="https://enverde.app/activar" className="mt-2 text-sm underline">
          Vuelve a activar Enverde
        </a>
      </Centered>
    );
  }

  if (selectedId) {
    return (
      <PostDetail
        user={user}
        orgId={orgId}
        isStaff={isStaff}
        postId={selectedId}
        onBack={() => {
          setSelectedId(null);
          loadPosts();
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* ── Header ── */}
      <a href={`/org/${orgId}`} className="text-sm" style={{ color: "var(--t-muted)" }}>
        ← Volver a tu panel
      </a>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
            enverde · comunidad
          </p>
          <h1 className="mt-1 text-3xl font-black" style={{ color: "var(--t-text)" }}>
            La comunidad Enverde
          </h1>
          <p className="mt-2 text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
            Novedades del producto y preguntas entre cafeterías, bares y restaurantes.
            Pregunta, comparte lo que te funciona, aprende de otros como tú.
          </p>
        </div>
      </div>

      {/* ── Novedades (nuevas funcionalidades) ── */}
      {announcements.length > 0 && (
        <section className="mt-7">
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--t-muted)" }}>
            🟢 Novedades
          </h2>
          <div className="mt-3 grid gap-3">
            {announcements.slice(0, 4).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="rounded-2xl border p-4 text-left transition"
                style={{ borderColor: "var(--t-accent)", background: "var(--t-accent-light)" }}
              >
                <span className="text-xs font-bold" style={{ color: "var(--t-accent)" }}>
                  {p.authorName} · {timeAgo(p.createdAt)}
                </span>
                <h3 className="mt-1 text-base font-black" style={{ color: "var(--t-text)" }}>
                  {p.title}
                </h3>
                {p.body && (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
                    {p.body}
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Preguntas + topics ── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--t-muted)" }}>
            Preguntas
          </h2>
          <button
            onClick={() => setComposerOpen((v) => !v)}
            className="rounded-full px-4 py-2 text-sm font-bold transition"
            style={{ background: ACCENT, color: "#fff" }}
          >
            {composerOpen ? "Cerrar" : "Hacer una pregunta"}
          </button>
        </div>

        {composerOpen && (
          <Composer
            user={user}
            orgId={orgId}
            isStaff={isStaff}
            defaultTopic={tab === "all" ? "general" : tab}
            onDone={() => {
              setComposerOpen(false);
              loadPosts();
            }}
          />
        )}

        {/* Tabs por topic */}
        <div className="mt-4 flex flex-wrap gap-2">
          <TabPill active={tab === "all"} onClick={() => setTab("all")}>
            Todas
          </TabPill>
          {TOPICS.map((t) => (
            <TabPill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.emoji} {t.label}
            </TabPill>
          ))}
        </div>

        {/* Feed */}
        <div className="mt-4 grid gap-3">
          {loadError && (
            <p className="text-sm" style={{ color: "var(--t-danger)" }}>
              {loadError}
            </p>
          )}
          {!posts && !loadError && <p className="text-sm" style={{ color: "var(--t-muted)" }}>Cargando…</p>}
          {posts && questions.length === 0 && !loadError && (
            <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--t-text)" }}>
                Aún no hay preguntas en este topic.
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--t-muted)" }}>
                Sé el primero en preguntar algo a la comunidad.
              </p>
            </div>
          )}
          {questions.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className="rounded-xl border p-4 text-left transition"
              style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}
            >
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--t-dim)" }}>
                <span
                  className="rounded-full px-2 py-0.5 font-semibold"
                  style={{ background: "var(--t-accent-light)", color: "var(--t-muted)" }}
                >
                  {topicEmoji(p.topic)} {topicLabel(p.topic)}
                </span>
                <span>{p.authorName}</span>
                <span aria-hidden>·</span>
                <span>{timeAgo(p.createdAt)}</span>
              </div>
              <h3 className="mt-2 text-base font-bold" style={{ color: "var(--t-text)" }}>
                {p.title}
              </h3>
              {p.body && (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
                  {p.body}
                </p>
              )}
              <p className="mt-2 text-xs font-semibold" style={{ color: "var(--t-accent)" }}>
                {p.answerCount === 0
                  ? "Sin respuestas todavía"
                  : `${p.answerCount} ${p.answerCount === 1 ? "respuesta" : "respuestas"}`}
              </p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ── Composer (nueva pregunta / novedad) ─────────────────── */

function Composer({
  user,
  orgId,
  isStaff,
  defaultTopic,
  onDone,
}: {
  user: User;
  orgId: string;
  isStaff: boolean;
  defaultTopic: Topic;
  onDone: () => void;
}) {
  const [type, setType] = useState<PostType>("question");
  const [topic, setTopic] = useState<Topic>(defaultTopic);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setError("Ponle un título a tu pregunta");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await authedFetch(user, `/api/community/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, topic, title, body, orgId }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "No pudimos publicar");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos publicar");
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      {isStaff && (
        <div className="mb-3 flex gap-2">
          <TabPill active={type === "question"} onClick={() => setType("question")}>
            Pregunta
          </TabPill>
          <TabPill active={type === "announcement"} onClick={() => setType("announcement")}>
            Novedad (equipo)
          </TabPill>
        </div>
      )}

      {type === "question" && (
        <div className="mb-3 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <TabPill key={t.id} active={topic === t.id} onClick={() => setTopic(t.id)}>
              {t.emoji} {t.label}
            </TabPill>
          ))}
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={LIMITS.TITLE_MAX}
        placeholder={type === "announcement" ? "Título de la novedad" : "¿Qué quieres preguntar?"}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--t-border)", background: "var(--t-bg)", color: "var(--t-text)" }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={LIMITS.BODY_MAX}
        rows={4}
        placeholder={type === "announcement" ? "Cuenta qué cambia y para quién." : "Da contexto: tipo de local, qué has probado, qué buscas."}
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--t-border)", background: "var(--t-bg)", color: "var(--t-text)" }}
      />
      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--t-danger)" }}>
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-full px-5 py-2 text-sm font-bold transition disabled:opacity-60"
          style={{ background: ACCENT, color: "#fff" }}
        >
          {submitting ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </div>
  );
}

/* ── Detalle de un post + respuestas ─────────────────────── */

function PostDetail({
  user,
  orgId,
  isStaff,
  postId,
  onBack,
}: {
  user: User;
  orgId: string;
  isStaff: boolean;
  postId: string;
  onBack: () => void;
}) {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [answers, setAnswers] = useState<CommunityAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/community/posts/${postId}`);
      const d = (await r.json().catch(() => ({}))) as {
        post?: CommunityPost;
        answers?: CommunityAnswer[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? "No pudimos cargar la conversación");
      setPost(d.post ?? null);
      setAnswers(d.answers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar la conversación");
    }
  }, [user, postId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (sending || !reply.trim()) return;
    setSending(true);
    try {
      const r = await authedFetch(user, `/api/community/posts/${postId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply, orgId }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "No pudimos enviar tu respuesta");
      setReply("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu respuesta");
    }
    setSending(false);
  };

  const toggleVote = async (a: CommunityAnswer) => {
    // Optimista: refleja el cambio al instante y revierte si falla.
    setAnswers((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, voted: !x.voted, upvotes: x.upvotes + (x.voted ? -1 : 1) } : x))
    );
    try {
      const r = await authedFetch(user, `/api/community/posts/${postId}/answers/${a.id}/vote`, { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { upvotes?: number; voted?: boolean; error?: string };
      if (!r.ok || typeof d.upvotes !== "number") throw new Error(d.error ?? "vote failed");
      setAnswers((prev) => prev.map((x) => (x.id === a.id ? { ...x, voted: !!d.voted, upvotes: d.upvotes! } : x)));
    } catch {
      setAnswers((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, voted: a.voted, upvotes: a.upvotes } : x))
      );
    }
  };

  // ── Moderación ──
  const report = async (answerId?: string) => {
    if (!window.confirm("¿Reportar este contenido para que lo revise el equipo de Enverde?")) return;
    try {
      const r = await authedFetch(user, `/api/community/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, answerId }),
      });
      if (!r.ok) throw new Error();
      window.alert("Gracias. Lo revisaremos.");
    } catch {
      setError("No pudimos enviar el reporte. Inténtalo de nuevo.");
    }
  };

  const deletePost = async () => {
    if (!window.confirm("¿Eliminar este hilo? No se puede deshacer.")) return;
    try {
      const r = await authedFetch(user, `/api/community/posts/${postId}/delete`, { method: "POST" });
      if (!r.ok) throw new Error();
      onBack();
    } catch {
      setError("No pudimos eliminar el hilo.");
    }
  };

  const deleteAnswer = async (answerId: string) => {
    if (!window.confirm("¿Eliminar esta respuesta? No se puede deshacer.")) return;
    try {
      const r = await authedFetch(user, `/api/community/posts/${postId}/answers/${answerId}/delete`, { method: "POST" });
      if (!r.ok) throw new Error();
      setAnswers((prev) => prev.filter((x) => x.id !== answerId));
    } catch {
      setError("No pudimos eliminar la respuesta.");
    }
  };

  const canModerate = (authorUid: string) => isStaff || authorUid === user.uid;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <button onClick={onBack} className="text-sm" style={{ color: "var(--t-muted)" }}>
        ← Volver a la comunidad
      </button>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--t-danger)" }}>
          {error}
        </p>
      )}

      {post && (
        <article className="mt-4">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--t-dim)" }}>
            {post.type === "announcement" ? (
              <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "var(--t-accent-light)", color: "var(--t-accent)" }}>
                🟢 Novedad
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--t-accent-light)", color: "var(--t-muted)" }}>
                {topicEmoji(post.topic)} {topicLabel(post.topic)}
              </span>
            )}
            <span>{post.authorName}</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(post.createdAt)}</span>
          </div>
          <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--t-text)" }}>
            {post.title}
          </h1>
          {post.body && (
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
              {post.body}
            </p>
          )}

          {/* Moderación del hilo */}
          <div className="mt-3 flex items-center gap-3 text-xs">
            {isStaff && (post.reportCount ?? 0) > 0 && (
              <span className="font-bold" style={{ color: "var(--t-danger)" }}>
                ⚑ {post.reportCount} {post.reportCount === 1 ? "reporte" : "reportes"}
              </span>
            )}
            {canModerate(post.authorUid) ? (
              <button onClick={deletePost} className="font-semibold" style={{ color: "var(--t-danger)" }}>
                Eliminar
              </button>
            ) : (
              <button onClick={() => report()} style={{ color: "var(--t-dim)" }}>
                Reportar
              </button>
            )}
          </div>

          {/* Respuestas */}
          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--t-muted)" }}>
            {answers.length === 0
              ? "Sin respuestas"
              : `${answers.length} ${answers.length === 1 ? "respuesta" : "respuestas"}`}
          </h2>
          <div className="mt-3 grid gap-3">
            {answers.map((a) => (
              <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--t-dim)" }}>
                  <span className="font-semibold" style={{ color: a.isStaff ? "var(--t-accent)" : "var(--t-muted)" }}>
                    {a.authorName}
                  </span>
                  {a.isStaff && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--t-accent-light)", color: "var(--t-accent)" }}>
                      Equipo
                    </span>
                  )}
                  <span aria-hidden>·</span>
                  <span>{timeAgo(a.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--t-text)" }}>
                  {a.body}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleVote(a)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition"
                    style={
                      a.voted
                        ? { borderColor: "var(--t-accent)", background: "var(--t-accent-light)", color: "var(--t-accent)" }
                        : { borderColor: "var(--t-border)", background: "transparent", color: "var(--t-muted)" }
                    }
                    aria-pressed={a.voted}
                    title={a.voted ? "Quitar voto" : "Votar esta respuesta"}
                  >
                    <span aria-hidden>▲</span>
                    {a.upvotes > 0 ? `${a.upvotes} ${a.upvotes === 1 ? "voto" : "votos"}` : "Útil"}
                  </button>
                  {isStaff && (a.reportCount ?? 0) > 0 && (
                    <span className="text-xs font-bold" style={{ color: "var(--t-danger)" }}>
                      ⚑ {a.reportCount}
                    </span>
                  )}
                  {canModerate(a.authorUid) ? (
                    <button onClick={() => deleteAnswer(a.id)} className="text-xs font-semibold" style={{ color: "var(--t-danger)" }}>
                      Eliminar
                    </button>
                  ) : (
                    <button onClick={() => report(a.id)} className="text-xs" style={{ color: "var(--t-dim)" }}>
                      Reportar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Responder (solo en preguntas) */}
          {post.type === "question" && (
            <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={LIMITS.ANSWER_MAX}
                rows={3}
                placeholder="Comparte tu experiencia o cómo lo resolviste tú…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--t-border)", background: "var(--t-bg)", color: "var(--t-text)" }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={send}
                  disabled={sending || !reply.trim()}
                  className="rounded-full px-5 py-2 text-sm font-bold transition disabled:opacity-60"
                  style={{ background: ACCENT, color: "#fff" }}
                >
                  {sending ? "Enviando…" : "Responder"}
                </button>
              </div>
            </div>
          )}
        </article>
      )}
    </main>
  );
}

/* ── Helpers UI ──────────────────────────────────────────── */

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-sm font-semibold transition"
      style={
        active
          ? { background: ACCENT, color: "#fff" }
          : { background: "var(--t-surface)", color: "var(--t-muted)", border: "1px solid var(--t-border)" }
      }
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center" style={{ color: "var(--t-muted)" }}>
      {children}
    </main>
  );
}

function timeAgo(ms: number | null): string {
  if (!ms) return "ahora";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
