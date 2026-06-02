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

type Blocks = {
  quePaso: string;
  porquePaso: string;
  queBien: string;
  quePreocupa: string;
  queDecision: string;
  sueldoGeremi: string;
  queFaltaVerde: string;
};

type Phase = "upload" | "extracting" | "summarizing" | "done" | "error";

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
        };
        if (!exRes.ok || !exData.ok) {
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
        };
        if (!sumRes.ok || !sumData.ok || !sumData.summary?.blocks) {
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

  /* ─── Estados de auth ─────────────────────────────────────── */
  if (!authReady) {
    return <Centered>Cargando…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        <p className="text-lg font-medium">Tu sesión no está activa.</p>
        <a href="https://enverde.app/activar" className="mt-2 text-sm underline">
          Vuelve a activar tu CFO
        </a>
      </Centered>
    );
  }

  /* ─── Resultado ───────────────────────────────────────────── */
  if (phase === "done" && summary) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
          Tu CFO · {month}
        </p>
        <h1 className="mt-2 text-2xl font-black">Esto es lo que dice tu mes</h1>

        <section
          className="mt-6 rounded-2xl p-6 text-white"
          style={{ background: ACCENT }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Cuánto puedes cobrar
          </p>
          <p className="mt-2 text-lg leading-relaxed">{summary.sueldoGeremi}</p>
        </section>

        <Block title="Qué te falta para llegar a verde" body={summary.queFaltaVerde} highlight />
        <Block title="Qué pasó este mes" body={summary.quePaso} />
        <Block title="Por qué" body={summary.porquePaso} />
        <Block title="Qué está bien" body={summary.queBien} />
        <Block title="Qué preocupa" body={summary.quePreocupa} />
        <Block title="Qué decisión tomar" body={summary.queDecision} />

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={`/org/${orgId}/treasury/start`}
            onClick={(e) => {
              e.preventDefault();
              setSummary(null);
              setMonth(null);
              setPhase("upload");
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
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
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
        enverde · tu CFO
      </p>
      <h1 className="mt-2 text-2xl font-black">Sube el extracto de tu banco</h1>
      <p className="mt-2 text-gray-600">
        PDF, CSV o XLSX. Te decimos cuánto puedes cobrar este mes, con semáforo y qué
        te falta para llegar a verde. Tarda unos segundos.
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
        <p className="mt-3 text-sm text-gray-500">
          {phase === "extracting"
            ? "Extrayendo y clasificando tus movimientos…"
            : "Tu CFO está leyendo el mes…"}
        </p>
      )}

      {phase === "error" && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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

      <p className="mt-6 text-xs text-gray-400">
        Tus movimientos se usan solo para calcular tu sueldo y tu semáforo.
      </p>
    </main>
  );
}

function Block({ title, body, highlight }: { title: string; body: string; highlight?: boolean }) {
  return (
    <section
      className={`mt-4 rounded-xl border p-4 ${
        highlight ? "border-gray-300 bg-gray-50" : "border-gray-200"
      }`}
    >
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      <p className="mt-1 leading-relaxed text-gray-700">{body}</p>
    </section>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center text-gray-700">
      {children}
    </main>
  );
}
