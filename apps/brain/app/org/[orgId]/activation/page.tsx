"use client";

/**
 * /org/[orgId]/activation — mini-dashboard interno de activación Enverde.
 *
 * READ-ONLY sobre /api/org/[orgId]/activation-summary (counts + últimos
 * eventos del tracking del hub). Sin link público en nav/hub: ruta oculta,
 * protegida por membership en el API (requireOrgMember). Privacidad: solo
 * counts, tipos, fechas y metadata segura (surface/step/state) — nunca
 * importes, productos, extractos ni datos de clientes.
 *
 * Self-contained: auth propia (onAuthStateChanged), igual que el hub.
 */
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";
import type { ActivationEventType } from "@/lib/event-types";

type Summary = {
  totals: Record<ActivationEventType, number>;
  onboardingSteps: { step: number; count: number }[];
  recent: { type: string; timestamp: string | null; surface: string | null; step: number | null; state: string | null }[];
  totalEvents: number;
};

const TYPE_LABELS: Record<string, string> = {
  demo_opened: "Demo abierta",
  demo_closed: "Demo cerrada",
  cta_upload_statement_clicked: "Subir extracto clicado",
  cta_products_clicked: "Productos clicado",
  cta_recipes_clicked: "Escandallos clicado",
  cta_manual_sales_clicked: "Ventas manuales clicadas",
  profitability_summary_seen: "Resumen visto",
  onboarding_step_clicked: "Paso de onboarding clicado",
};

const FUNNEL: ActivationEventType[] = [
  "profitability_summary_seen",
  "demo_opened",
  "cta_upload_statement_clicked",
  "cta_products_clicked",
  "cta_recipes_clicked",
  "cta_manual_sales_clicked",
];

const CARDS: ActivationEventType[] = [
  "demo_opened",
  "profitability_summary_seen",
  "cta_upload_statement_clicked",
  "cta_manual_sales_clicked",
];

const STEP_LABELS = ["Sube tu extracto", "Añade productos", "Prepara escandallos", "Añade ventas manuales", "Revisa tu rentabilidad"];

export default function ActivationPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = String(params?.orgId || "");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const load = useCallback(async (u: User) => {
    try {
      const r = await authedFetch(u, `/api/org/${orgId}/activation-summary`);
      if (r.ok) setData(await r.json());
      else setError(true);
    } catch (e) {
      console.error("Activation summary:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (user) load(user);
  }, [user, load]);

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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-accent)" }}>
        enverde · interno
      </p>
      <h1 className="mt-2 text-3xl font-black" style={{ color: "var(--t-text)" }}>
        Activación Enverde
      </h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--t-muted)" }}>
        Señales internas para entender si la demo y la ruta guiada ayudan a que el
        usuario llegue al resumen de rentabilidad.
      </p>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--t-dim)" }}>
        Solo counts, tipos y fechas. Sin importes, sin productos, sin datos de clientes.
      </p>

      {loading && <p className="mt-8 text-sm" style={{ color: "var(--t-muted)" }}>Cargando señales…</p>}
      {error && !loading && (
        <p className="mt-8 text-sm" style={{ color: "var(--t-muted)" }}>
          No se pudieron cargar las señales. Recarga la página o vuelve más tarde.
        </p>
      )}

      {data && data.totalEvents === 0 && (
        <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--t-text)" }}>
            Aún no hay eventos de activación
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
            En cuanto alguien use el hub, abra la cafetería demo o haga clic en la ruta
            guiada, las señales aparecerán aquí.
          </p>
        </section>
      )}

      {data && data.totalEvents > 0 && (
        <>
          {/* Cards principales */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CARDS.map((t) => (
              <div key={t} className="rounded-xl border p-5" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-dim)" }}>
                  {TYPE_LABELS[t]}
                </p>
                <p className="mt-2 text-3xl font-black" style={{ color: "var(--t-text)" }}>
                  {data.totals[t] ?? 0}
                </p>
              </div>
            ))}
          </div>

          {/* Funnel básico */}
          <Section title="Funnel básico">
            {(() => {
              const max = Math.max(1, ...FUNNEL.map((t) => data.totals[t] ?? 0));
              return (
                <ul className="mt-4 space-y-2">
                  {FUNNEL.map((t) => {
                    const n = data.totals[t] ?? 0;
                    return (
                      <li key={t} className="flex items-center gap-3">
                        <span className="w-52 shrink-0 text-sm" style={{ color: "var(--t-muted)" }}>
                          {TYPE_LABELS[t]}
                        </span>
                        <span className="h-3 rounded-full" style={{ width: `${(n / max) * 100}%`, minWidth: n > 0 ? 8 : 0, background: "var(--t-accent)" }} />
                        <span className="text-sm font-bold" style={{ color: "var(--t-text)" }}>{n}</span>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </Section>

          {/* Totales por tipo */}
          <Section title="Total de eventos por tipo">
            <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {(Object.keys(TYPE_LABELS) as ActivationEventType[]).map((t) => (
                <li key={t} className="flex items-baseline justify-between gap-3 text-sm">
                  <span style={{ color: "var(--t-muted)" }}>{TYPE_LABELS[t]}</span>
                  <span className="font-bold" style={{ color: "var(--t-text)" }}>{data.totals[t] ?? 0}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Top pasos del onboarding */}
          <Section title="Pasos del onboarding más clicados">
            {data.onboardingSteps.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--t-muted)" }}>Aún sin clics en la ruta guiada.</p>
            ) : (
              <ul className="mt-4 space-y-1">
                {data.onboardingSteps.map((s) => (
                  <li key={s.step} className="flex items-baseline justify-between gap-3 text-sm">
                    <span style={{ color: "var(--t-muted)" }}>
                      Paso {s.step}{STEP_LABELS[s.step - 1] ? ` · ${STEP_LABELS[s.step - 1]}` : ""}
                    </span>
                    <span className="font-bold" style={{ color: "var(--t-text)" }}>{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Últimos eventos */}
          <Section title="Últimos eventos">
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Tipo", "Fecha", "Surface", "Step", "State"].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-dim)", borderBottom: "1px solid var(--t-border)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2 font-medium" style={{ color: "var(--t-text)", borderBottom: "1px solid var(--t-border)" }}>
                        {TYPE_LABELS[e.type] ?? e.type}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>{e.surface ?? "—"}</td>
                      <td className="px-2 py-2" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>{e.step ?? "—"}</td>
                      <td className="px-2 py-2" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>{e.state ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <h2 className="text-base font-bold" style={{ color: "var(--t-text)" }}>{title}</h2>
      {children}
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
