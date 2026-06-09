"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";

/**
 * "Tu ruta para calcular la rentabilidad" — onboarding guiado del hub
 * /org/[orgId]. Lee el MISMO endpoint read-only que ProfitabilitySummary
 * (/api/org/[orgId]/profitability-summary; segundo GET asumido: barato y
 * mantiene ambos componentes self-contained) y deriva el estado de cada paso:
 *   - completado: el dato ya existe,
 *   - recomendado: primer paso sin completar (el siguiente a hacer),
 *   - pendiente: el resto sin completar.
 * Si la carga falla degrada a "nada completado" (paso 1 recomendado) en vez de
 * desaparecer: la ruta sigue guiando. Solo lectura, cero lógica financiera.
 */

type Snapshot = {
  cashPresent: boolean;
  hasRecipes: boolean;
  hasSales: boolean;
  pendingEscandallos: number;
};

type Props = {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
};

export default function ProfitabilityOnboarding({ user, orgId, authedFetch }: Props) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/profitability-summary`);
      if (r.ok) {
        const d = await r.json();
        setSnap({
          cashPresent: Boolean(d?.cash?.present),
          hasRecipes: Boolean(d?.margin?.hasRecipes),
          hasSales: Boolean(d?.margin?.hasSales),
          pendingEscandallos: Number(d?.margin?.pendingEscandallos) || 0,
        });
      }
    } catch (e) {
      console.error("Profitability onboarding:", e);
    } finally {
      setLoading(false);
    }
  }, [user, orgId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  const s = snap ?? { cashPresent: false, hasRecipes: false, hasSales: false, pendingEscandallos: 0 };

  const steps = [
    {
      title: "Sube tu extracto",
      desc: "Tu caja calcula el sueldo que puedes cobrarte.",
      href: `/org/${orgId}/treasury/start`,
      done: s.cashPresent,
    },
    {
      title: "Añade productos",
      desc: "Tu carta es la base del cálculo de márgenes.",
      href: "/?section=products",
      done: s.hasRecipes,
    },
    {
      title: "Prepara escandallos",
      desc: "Con costes por producto sabemos qué margen deja cada uno.",
      href: "/?section=recipes",
      done: s.hasRecipes,
      note: s.hasRecipes && s.pendingEscandallos > 0 ? `${s.pendingEscandallos} sin coste aún` : undefined,
    },
    {
      title: "Añade ventas manuales",
      desc: "Las unidades vendidas convierten márgenes en euros del mes.",
      href: "/?section=margins",
      done: s.hasSales,
    },
    {
      title: "Revisa tu rentabilidad",
      desc: "Caja + costes + ventas: cuánto puedes cobrarte y qué lo sostiene.",
      href: "/?section=margins",
      done: s.cashPresent && s.hasRecipes && s.hasSales,
    },
  ];
  const nextIdx = steps.findIndex((st) => !st.done);
  const allDone = nextIdx === -1;

  return (
    <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <h2 className="text-xl font-black" style={{ color: "var(--t-text)" }}>
        Tu ruta para calcular la rentabilidad
      </h2>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
        {allDone
          ? "Ruta completa. Vuelve cada mes para mantener tu caja, ventas y márgenes al día."
          : "Completa estos pasos para que Enverde pueda decirte cuánto puedes cobrarte y qué productos sostienen tu sueldo."}
      </p>

      <ol className="mt-5 space-y-3">
        {steps.map((st, i) => {
          const state = st.done ? "completado" : i === nextIdx ? "recomendado" : "pendiente";
          const recommended = state === "recomendado";
          return (
            <li key={st.title}>
              <a
                href={st.href}
                className="flex items-start gap-3 rounded-xl border p-4 transition"
                style={{
                  borderColor: recommended ? "var(--t-accent)" : "var(--t-border)",
                  background: recommended ? "var(--t-accent-light)" : "var(--t-bg)",
                  opacity: state === "pendiente" ? 0.75 : 1,
                }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    st.done
                      ? { background: "var(--t-accent)", color: "#fff" }
                      : { border: "1.5px solid var(--t-border)", color: "var(--t-dim)" }
                  }
                >
                  {st.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: "var(--t-text)" }}>
                      {st.title}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={
                        st.done
                          ? { background: "var(--t-accent-14)", color: "var(--t-accent)" }
                          : recommended
                            ? { background: "var(--t-accent)", color: "#fff" }
                            : { background: "var(--t-accent-08)", color: "var(--t-dim)" }
                      }
                    >
                      {state}
                    </span>
                    {st.note && (
                      <span className="text-[11px] font-medium" style={{ color: "var(--t-dim)" }}>
                        {st.note}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: "var(--t-muted)" }}>
                    {st.desc}
                  </span>
                </span>
                <span aria-hidden className="mt-1 text-sm font-bold" style={{ color: "var(--t-accent)" }}>
                  →
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
