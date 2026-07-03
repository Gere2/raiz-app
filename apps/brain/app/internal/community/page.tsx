"use client";

/**
 * /internal/community — panel de revisión de reportes de la comunidad (equipo).
 *
 * Ruta oculta (sin links en nav), gate en el API por claim staff:true. Lista la
 * cola de moderación (reportes sin resolver, agrupados por objeto) y permite:
 *   - Ocultar el contenido (borrado blando, reutiliza los endpoints de delete).
 *   - Descartar el reporte (el contenido se queda; limpia el flag).
 *
 * Self-contained: auth propia con login Google, como /internal/pilot.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInWithGoogle, consumeRedirectResult } from "@/lib/auth-client";
import { authedFetch } from "@/lib/authed-fetch";
import { topicEmoji, topicLabel, type CommunityReportGroup } from "@/lib/community";

const ACCENT = "var(--t-accent)";

export default function InternalCommunityPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [reports, setReports] = useState<CommunityReportGroup[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    consumeRedirectResult();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const load = useCallback(async (u: User) => {
    try {
      const r = await authedFetch(u, "/api/community/reports");
      if (r.ok) {
        const d = await r.json();
        setReports(Array.isArray(d?.reports) ? d.reports : []);
        setForbidden(false);
        setError(false);
      } else if (r.status === 403) {
        setForbidden(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) load(user);
  }, [user, load]);

  const act = useCallback(
    async (g: CommunityReportGroup, action: "hide" | "dismiss") => {
      if (!user || busyKey) return;
      setBusyKey(g.key);
      try {
        const path =
          action === "dismiss"
            ? "/api/community/reports/resolve"
            : g.targetType === "answer"
              ? `/api/community/posts/${g.postId}/answers/${g.answerId}/delete`
              : `/api/community/posts/${g.postId}/delete`;
        const body =
          action === "dismiss" ? JSON.stringify({ postId: g.postId, answerId: g.answerId }) : undefined;
        const r = await authedFetch(user, path, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body,
        });
        if (!r.ok) throw new Error();
        // Optimista: saca el grupo de la cola.
        setReports((prev) => (prev ? prev.filter((x) => x.key !== g.key) : prev));
      } catch {
        setError(true);
      }
      setBusyKey(null);
    },
    [user, busyKey]
  );

  if (!authReady) return <Centered>Cargando…</Centered>;

  if (!user) {
    return (
      <Centered>
        <p className="text-lg font-medium" style={{ color: "var(--t-text)" }}>
          Moderación de la comunidad
        </p>
        <p className="text-sm">Inicia sesión con tu cuenta del equipo.</p>
        <button
          onClick={() => signInWithGoogle()}
          className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold"
          style={{ background: ACCENT, color: "var(--t-on-accent)" }}
        >
          Entrar con Google
        </button>
      </Centered>
    );
  }

  if (forbidden) {
    return (
      <Centered>
        <p className="text-lg font-medium" style={{ color: "var(--t-text)" }}>
          Solo equipo interno
        </p>
        <p className="text-sm">Esta vista es de moderación y tu cuenta no tiene acceso.</p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
        enverde · interno
      </p>
      <h1 className="mt-2 text-3xl font-black" style={{ color: "var(--t-text)" }}>
        Reportes de la comunidad
      </h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
        Cola de revisión: contenido que la comunidad ha marcado. Oculta lo que sobre
        o descarta el reporte si está bien.
      </p>

      {error && (
        <p className="mt-6 text-sm" style={{ color: "var(--t-danger)" }}>
          Algo falló. Recarga la página.
        </p>
      )}

      {!reports && !error && (
        <p className="mt-8 text-sm" style={{ color: "var(--t-muted)" }}>
          Cargando reportes…
        </p>
      )}

      {reports && reports.length === 0 && (
        <div className="mt-8 rounded-2xl border p-8 text-center" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
          <p className="text-base font-bold" style={{ color: "var(--t-text)" }}>
            Nada que revisar 🎉
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--t-muted)" }}>
            No hay reportes pendientes en la comunidad.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {reports?.map((g) => (
          <div key={g.key} className="rounded-2xl border p-5" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--t-dim)" }}>
              <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)" }}>
                ⚑ {g.reportCount} {g.reportCount === 1 ? "reporte" : "reportes"}
              </span>
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--t-accent-light)", color: "var(--t-muted)" }}>
                {g.targetType === "answer" ? "Respuesta" : "Hilo"} · {topicEmoji(g.topic)} {topicLabel(g.topic)}
              </span>
              <span>{g.authorName}</span>
            </div>

            <p className="mt-2 text-sm font-bold" style={{ color: "var(--t-text)" }}>
              {g.title || "(sin título)"}
            </p>
            {g.excerpt && (
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
                {g.targetType === "answer" ? `↳ ${g.excerpt}` : g.excerpt}
              </p>
            )}

            {g.reasons.length > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--t-dim)" }}>
                Motivos: {g.reasons.join(" · ")}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => act(g, "hide")}
                disabled={busyKey === g.key}
                className="rounded-full px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60"
                style={{ background: "var(--t-danger)" }}
              >
                {busyKey === g.key ? "…" : "Ocultar contenido"}
              </button>
              <button
                onClick={() => act(g, "dismiss")}
                disabled={busyKey === g.key}
                className="rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                style={{ borderColor: "var(--t-border)", color: "var(--t-muted)" }}
              >
                Descartar reporte
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center" style={{ color: "var(--t-muted)" }}>
      {children}
    </main>
  );
}
