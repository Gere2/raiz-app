"use client";

/**
 * /org/[orgId]/settings/anthropic  — BYOK: el café conecta su clave Anthropic.
 *
 * Self-contained: auth propia (onAuthStateChanged) + authedFetch, igual que
 * treasury/start. La clave se envía al backend, que la cifra; nunca se vuelve a
 * mostrar (solo estado + last4).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";

const ACCENT = "#3F6B2E";

type Status = { configured: boolean; last4: string | null };

export default function AnthropicKeyPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const loadStatus = useCallback(
    async (u: User) => {
      try {
        const r = await authedFetch(u, `/api/org/${orgId}/settings/anthropic-key`);
        const d = (await r.json().catch(() => ({}))) as Status & { error?: string };
        if (r.ok) setStatus({ configured: !!d.configured, last4: d.last4 ?? null });
      } catch {
        /* estado opcional */
      }
    },
    [orgId],
  );

  useEffect(() => {
    if (user) loadStatus(user);
  }, [user, loadStatus]);

  const save = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/settings/anthropic-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const d = (await r.json().catch(() => ({}))) as Status & { error?: string };
      if (!r.ok) {
        setError(d.error ?? "No pudimos guardar la clave.");
      } else {
        setStatus({ configured: true, last4: d.last4 ?? null });
        setKeyInput("");
        setSaved(true);
      }
    } catch {
      setError("Algo falló al guardar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [user, orgId, keyInput]);

  const remove = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/settings/anthropic-key`, {
        method: "DELETE",
      });
      if (r.ok) setStatus({ configured: false, last4: null });
    } catch {
      setError("No pudimos borrar la clave.");
    } finally {
      setBusy(false);
    }
  }, [user, orgId]);

  if (!authReady) return <Centered>Cargando…</Centered>;
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

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
        enverde · ajustes
      </p>
      <h1 className="mt-2 text-2xl font-black">Tu clave de IA (Anthropic)</h1>
      <p className="mt-2 text-gray-600">
        Tu CFO usa esta clave para leer tu extracto y calcular tu sueldo. Es tuya: pagas tu propio
        consumo y tus datos van con tu cuenta. La guardamos cifrada y no volvemos a mostrarla.
      </p>

      {status?.configured && (
        <div
          className="mt-5 rounded-xl border p-4 text-sm"
          style={{ borderColor: ACCENT, color: ACCENT, background: "#E7F1E1" }}
        >
          ✓ Clave conectada{status.last4 ? ` (termina en ····${status.last4})` : ""}.
        </div>
      )}

      <label className="mt-6 text-sm font-semibold text-gray-700">
        {status?.configured ? "Reemplazar clave" : "Pega tu clave"}
      </label>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        placeholder="sk-ant-…"
        className="mt-2 rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm outline-none focus:border-gray-500"
      />

      <button
        type="button"
        disabled={busy || keyInput.trim().length < 10}
        onClick={save}
        className="mt-4 rounded-xl px-5 py-4 text-base font-bold text-white disabled:opacity-60"
        style={{ background: ACCENT }}
      >
        {busy ? "Guardando…" : "Guardar clave"}
      </button>

      {saved && <p className="mt-3 text-sm font-medium" style={{ color: ACCENT }}>Guardada. Ya puedes analizar tu extracto.</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <a href={`/org/${orgId}/treasury/start`} className="text-sm font-semibold underline" style={{ color: ACCENT }}>
          ← Volver a subir el extracto
        </a>
        {status?.configured && (
          <button type="button" onClick={remove} disabled={busy} className="text-sm text-gray-500 underline disabled:opacity-60">
            Borrar clave
          </button>
        )}
      </div>

      <p className="mt-8 text-xs text-gray-400">
        ¿No tienes clave? Puedes crear una en console.anthropic.com → API Keys. Anthropic puede
        cobrarte según su propia tarifa por el consumo del análisis.
      </p>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-1 px-6 text-center text-gray-700">
      {children}
    </main>
  );
}
