"use client";

/**
 * /org/[orgId]/treasury/start  (T4 — primer-uso enverde: extracto → sueldo en 30s)
 *
 * Destino del bridge /enverde-login. El café (ya autenticado vía custom token)
 * sube el extracto de su banco → POST treasury/extract (PDF/CSV/XLSX) → derivamos
 * el mes → POST treasury/monthly-summary → mostramos cuánto puede cobrar.
 *
 * Self-contained: auth propia (onAuthStateChanged) + authedFetch, igual que el
 * resto de pages del brain (app/escandallo, app/control-tower).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";

const ACCENT = "#3F6B2E";

// Handoff al TPV encendido para el piloto (2026-06-10: ventas reales pesan más
// que la coherencia de marca). El TPV vive en pos.raizygrano.com hasta que
// exista pos.enverde.app — entonces basta cambiar NEXT_PUBLIC_POS_URL.
const SHOW_POS_HANDOFF: boolean = true;

type Blocks = {
  quePaso: string;
  porquePaso: string;
  queBien: string;
  quePreocupa: string;
  queDecision: string;
  sueldoGeremi: string;
  queFaltaVerde: string;
};

type Phase = "upload" | "extracting" | "summarizing" | "done" | "error" | "needs_key";

export default function TreasuryStartPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Blocks | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openingPos, setOpeningPos] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) return;
      setError(null);
      setPhase("extracting");
      try {
        // 1) Extraer movimientos del extracto.
        const fd = new FormData();
        fd.append("file", file);
        const exRes = await authedFetch(user, `/api/org/${orgId}/treasury/extract`, {
          method: "POST",
          body: fd,
        });
        const exData = (await exRes.json().catch(() => ({}))) as {
          ok?: boolean;
          movements?: { date?: string }[];
          error?: string;
          code?: string;
        };
        if (!exRes.ok || !exData.ok) {
          if (exData.code === "NO_AI_KEY") { setPhase("needs_key"); return; }
          setError(exData.error ?? "No pudimos leer el extracto. Prueba con el PDF o CSV de tu banco.");
          setPhase("error");
          return;
        }

        // 2) Mes objetivo = el mes con más movimientos del extracto.
        const counts: Record<string, number> = {};
        for (const m of exData.movements ?? []) {
          const ym = String(m.date ?? "").slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(ym)) counts[ym] = (counts[ym] ?? 0) + 1;
        }
        const targetMonth = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!targetMonth) {
          setError("Leímos el archivo pero no detectamos fechas de movimientos.");
          setPhase("error");
          return;
        }
        setMonth(targetMonth);

        // 3) Generar el resumen CFO del mes.
        setPhase("summarizing");
        const sumRes = await authedFetch(user, `/api/org/${orgId}/treasury/monthly-summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: targetMonth, regenerate: true }),
        });
        const sumData = (await sumRes.json().catch(() => ({}))) as {
          ok?: boolean;
          summary?: { blocks?: Blocks };
          error?: string;
          code?: string;
        };
        if (!sumRes.ok || !sumData.ok || !sumData.summary?.blocks) {
          if (sumData.code === "NO_AI_KEY") { setPhase("needs_key"); return; }
          setError(sumData.error ?? "Leímos el extracto pero no pudimos generar tu resumen.");
          setPhase("error");
          return;
        }
        setSummary(sumData.summary.blocks);
        setPhase("done");
      } catch (e) {
        console.error("treasury/start error", e);
        setError("Algo falló por el camino. Inténtalo de nuevo.");
        setPhase("error");
      }
    },
    [user, orgId],
  );

  // Handoff al POS (otro origen → la sesión no se traslada): el brain acuña un
  // custom token fresco y redirige a pos.raizygrano.com/enverde-login.
  const openPos = useCallback(async () => {
    if (!user) return;
    setOpeningPos(true);
    setPosError(null);
    try {
      const r = await authedFetch(user, `/api/enverde/pos-login?orgId=${encodeURIComponent(orgId)}&next=/pos`);
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && d.url) {
        window.location.href = d.url;
      } else {
        setPosError(d.error ?? "No pudimos abrir el TPV. Inténtalo de nuevo.");
        setOpeningPos(false);
      }
    } catch {
      setPosError("No pudimos abrir el TPV. Inténtalo de nuevo.");
      setOpeningPos(false);
    }
  }, [user, orgId]);

  /* ─── Estados de auth ─────────────────────────────────────── */
  if (!authReady) {
    return <Centered>Cargando…</Centered>;
  }
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

  /* ─── Falta clave de IA (BYOK) ────────────────────────────── */
  if (phase === "needs_key") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
          enverde · cupo del mes
        </p>
        <h1 className="mt-2 text-2xl font-black">Has agotado el cupo gratuito del mes</h1>
        <p className="mt-2" style={{ color: "var(--t-muted)" }}>
          Has agotado el cupo gratuito de análisis incluidos este mes. Puedes esperar al próximo
          mes o conectar tu propia clave de Anthropic si quieres seguir analizando antes.
        </p>
        <a
          href={`/org/${orgId}/settings/anthropic`}
          className="mt-6 rounded-xl px-5 py-4 text-center text-base font-bold text-white"
          style={{ background: ACCENT }}
        >
          Conectar mi clave de Anthropic →
        </a>
        <p className="mt-3 text-sm" style={{ color: "var(--t-muted)" }}>
          Tu clave se guarda de forma cifrada y solo se usa para los análisis de tu negocio.
          Anthropic puede cobrarte según su propia tarifa.
        </p>
        <button
          type="button"
          onClick={() => setPhase("upload")}
          className="mt-4 text-sm underline"
          style={{ color: "var(--t-muted)" }}
        >
          Volver
        </button>
      </main>
    );
  }

  /* ─── Resultado ───────────────────────────────────────────── */
  if (phase === "done" && summary) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
          Diagnóstico de rentabilidad · {month}
        </p>
        <h1 className="mt-2 text-2xl font-black">Esto es lo que dice tu mes</h1>

        <section
          className="mt-6 rounded-2xl p-6 text-white"
          style={{ background: ACCENT }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Tu sueldo recomendado
          </p>
          <p className="mt-2 text-lg leading-relaxed">{summary.sueldoGeremi}</p>
        </section>

        <Block title="Qué te falta para llegar a verde" body={summary.queFaltaVerde} highlight />
        <Block title="Qué pasó este mes" body={summary.quePaso} />
        <Block title="Por qué" body={summary.porquePaso} />
        <Block title="Qué está bien" body={summary.queBien} />
        <Block title="Qué preocupa" body={summary.quePreocupa} />
        <Block title="Qué decisión tomar" body={summary.queDecision} />

        <p className="mt-8 text-xs leading-relaxed" style={{ color: "var(--t-dim)" }}>
          Esto sale de tu banco. Pronto Enverde sumará tus ventas (TPV) y tus costes
          (escandallos) para afinar tu sueldo al céntimo: ventas + margen + caja = lo que
          de verdad puedes cobrarte.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`/org/${orgId}/treasury/start`}
            onClick={(e) => {
              e.preventDefault();
              setSummary(null);
              setMonth(null);
              setPhase("upload");
            }}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--t-border)" }}
          >
            Subir otro mes
          </a>
        </div>
      </main>
    );
  }

  /* ─── Subida + progreso ───────────────────────────────────── */
  const busy = phase === "extracting" || phase === "summarizing";
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
        enverde · tu rentabilidad
      </p>
      <h1 className="mt-2 text-2xl font-black">¿Tu negocio te paga a ti?</h1>
      <p className="mt-2" style={{ color: "var(--t-muted)" }}>
        Enverde cruza tus ventas, tus costes y tu banco para decirte cuánto puedes
        cobrarte sin arriesgar la caja. Empezamos por tu banco: sube el extracto
        (PDF, CSV o XLSX) y te damos tu primer diagnóstico en segundos.
      </p>
      <p className="mt-3 text-sm font-semibold" style={{ color: "var(--t-accent)" }}>
        No solo vendas. Entiende cuánto te queda.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mt-6 rounded-xl px-5 py-4 text-base font-bold text-white disabled:opacity-70"
        style={{ background: ACCENT }}
      >
        {phase === "extracting"
          ? "Leyendo tu extracto…"
          : phase === "summarizing"
            ? "Calculando tu sueldo…"
            : "Elegir archivo del banco"}
      </button>

      {busy && (
        <p className="mt-3 text-sm" style={{ color: "var(--t-muted)" }}>
          {phase === "extracting"
            ? "Extrayendo y clasificando tus movimientos…"
            : "Enverde está leyendo tu mes…"}
        </p>
      )}

      {SHOW_POS_HANDOFF && (
        <>
          <button
            type="button"
            onClick={openPos}
            disabled={openingPos}
            className="mt-4 rounded-xl border px-5 py-3 text-sm font-semibold disabled:opacity-70"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            {openingPos ? "Abriendo TPV…" : "¿Ya tienes tu carta? Abrir TPV para cobrar →"}
          </button>
          {posError && <p className="mt-2 text-sm" style={{ color: "var(--t-danger)" }}>{posError}</p>}
        </>
      )}

      {phase === "error" && error && (
        <div className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--t-danger)", background: "var(--t-danger-bg)", color: "var(--t-danger)" }}>
          {error}
          <button
            type="button"
            onClick={() => setPhase("upload")}
            className="ml-2 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      <p className="mt-6 text-xs" style={{ color: "var(--t-dim)" }}>
        Tus movimientos solo se usan para calcular tu sueldo y tu semáforo. Tus datos
        son privados y no los vendemos.
      </p>
    </main>
  );
}

function Block({ title, body, highlight }: { title: string; body: string; highlight?: boolean }) {
  return (
    <section
      className="mt-4 rounded-xl border p-4"
      style={{
        borderColor: highlight ? "var(--t-accent)" : "var(--t-border)",
        background: highlight ? "var(--t-accent-light)" : "var(--t-surface)",
      }}
    >
      <h2 className="text-sm font-bold" style={{ color: "var(--t-text)" }}>{title}</h2>
      <p className="mt-1 leading-relaxed" style={{ color: "var(--t-muted)" }}>{body}</p>
    </section>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center" style={{ color: "var(--t-muted)" }}>
      {children}
    </main>
  );
}
