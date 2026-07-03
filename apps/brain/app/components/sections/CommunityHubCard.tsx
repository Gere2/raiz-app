"use client";

/**
 * CommunityHubCard — el "apartado de comunidad" en el inicio del café.
 *
 * Muestra lo último de la comunidad global (una novedad + preguntas recientes)
 * y enlaza al foro completo en /org/[orgId]/comunidad. Self-contained: si la
 * carga falla, se oculta y el hub sigue funcionando.
 */
import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { topicEmoji, topicLabel, type CommunityPost } from "@/lib/community";

const ACCENT = "var(--t-accent)";

export default function CommunityHubCard({
  user,
  orgId,
  authedFetch,
}: {
  user: User;
  orgId: string;
  authedFetch: (user: User, path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/community/posts?limit=6`);
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { posts?: CommunityPost[] };
      setPosts(d.posts ?? []);
    } catch {
      setFailed(true);
    }
    // Notificaciones (respuestas a tus hilos): no crítico, si falla se ignora.
    try {
      const rn = await authedFetch(user, `/api/community/notifications`);
      if (rn.ok) {
        const dn = (await rn.json()) as { unread?: number };
        setUnread(dn.unread ?? 0);
      }
    } catch {
      /* noop */
    }
  }, [user, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return null;

  const announcement = posts?.find((p) => p.type === "announcement") ?? null;
  const questions = (posts ?? []).filter((p) => p.type === "question").slice(0, 3);
  const href = `/org/${orgId}/comunidad`;

  return (
    <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
            comunidad enverde
          </p>
          <h2 className="mt-1 text-xl font-black" style={{ color: "var(--t-text)" }}>
            No estás sola en esto
          </h2>
        </div>
        <a href={href} className="shrink-0 text-sm font-bold" style={{ color: ACCENT }}>
          Ver todo →
        </a>
      </div>

      {/* Notificación: respuestas nuevas a tus hilos */}
      {unread > 0 && (
        <a
          href={href}
          className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition"
          style={{ background: "var(--t-accent-light)", color: "var(--t-accent)" }}
        >
          🔔 {unread} {unread === 1 ? "respuesta nueva" : "respuestas nuevas"} a tus preguntas
        </a>
      )}

      {!posts && (
        <p className="mt-3 text-sm" style={{ color: "var(--t-muted)" }}>
          Cargando…
        </p>
      )}

      {/* Última novedad (nueva funcionalidad) */}
      {announcement && (
        <a
          href={href}
          className="mt-4 block rounded-xl border p-4 transition"
          style={{ borderColor: "var(--t-accent)", background: "var(--t-accent-light)" }}
        >
          <span className="text-xs font-bold" style={{ color: "var(--t-accent)" }}>
            🟢 Novedad · {announcement.authorName}
          </span>
          <p className="mt-1 text-sm font-bold" style={{ color: "var(--t-text)" }}>
            {announcement.title}
          </p>
        </a>
      )}

      {/* Preguntas recientes de otros negocios */}
      {questions.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {questions.map((q) => (
            <li key={q.id}>
              <a href={href} className="flex items-start gap-2 text-sm" style={{ color: "var(--t-text)" }}>
                <span className="shrink-0" style={{ color: "var(--t-dim)" }}>
                  {topicEmoji(q.topic)}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{q.title}</span>
                  <span className="ml-1 text-xs" style={{ color: "var(--t-dim)" }}>
                    · {topicLabel(q.topic)} · {q.answerCount === 0 ? "sin respuestas" : `${q.answerCount} resp.`}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {posts && !announcement && questions.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: "var(--t-muted)" }}>
          Estrena la comunidad: pregunta algo a otras cafeterías, bares y restaurantes.
        </p>
      )}

      <a
        href={href}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition"
        style={{ background: ACCENT, color: "var(--t-on-accent)" }}
      >
        Entrar a la comunidad
        <span aria-hidden>→</span>
      </a>
    </section>
  );
}
