"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { trackActivation } from "@/lib/track-activation";
import { computePilotReadinessChecklist, type ChecklistStep, type StepState } from "@/lib/profitability/readiness";
import type { InsightInput } from "@/lib/profitability/insights";
import PilotFeedback from "./PilotFeedback";

/**
 * "Puesta a punto del diagnóstico" — checklist de primer uso del hub
 * /org/[orgId]. Lee el MISMO endpoint read-only que ProfitabilitySummary
 * (segundo GET asumido: barato y mantiene ambos self-contained) y deriva los
 * 6 pasos con computePilotReadinessChecklist (lib/profitability/readiness):
 * estados completado / atención / pendiente desde datos reales, sin lógica
 * financiera nueva. Si la carga falla degrada a "todo pendiente" en vez de
 * desaparecer. Los CTAs llevan a flujos existentes (Resumen, Escandallos,
 * ventas manuales, extracto); nada se bloquea.
 */

type Props = {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
};

const EMPTY: InsightInput = {
  cash: { present: false, semaforo: null, month: null },
  margin: {
    source: "none", hasRecipes: false, hasSales: false, grossMarginMonth: 0,
    topProduct: null, toReview: { count: 0, names: [] }, pendingEscandallos: 0,
    estimatedCosts: { count: 0, names: [] }, pos: null,
  },
};

const STATE_LABEL: Record<StepState, string> = {
  completado: "completado",
  atencion: "atención",
  pendiente: "pendiente",
};

export default function ProfitabilityOnboarding({ user, orgId, authedFetch }: Props) {
  const [input, setInput] = useState<InsightInput | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/profitability-summary`);
      if (r.ok) {
        const d = await r.json();
        setInput({ cash: d?.cash ?? EMPTY.cash, margin: d?.margin ?? EMPTY.margin, period: d?.period });
      }
    } catch (e) {
      console.error("Pilot readiness checklist:", e);
    } finally {
      setLoading(false);
    }
  }, [user, orgId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  const { steps, completed, total, ready } = computePilotReadinessChecklist(input ?? EMPTY);

  const hrefFor = (cta: NonNullable<ChecklistStep["cta"]>): string => {
    switch (cta.action) {
      case "manual-sales": return "/?section=margins";
      case "recipes": return "/?section=recipes";
      case "treasury": return `/org/${orgId}/treasury/start`;
      case "summary": return "#resumen-rentabilidad";
    }
  };

  return (
    <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--t-text)" }}>
          Puesta a punto del diagnóstico
        </h2>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--t-accent-14)", color: "var(--t-accent)" }}>
          {completed}/{total}
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
        Completa estos pasos para que Enverde lea bien tu mes.
      </p>

      {ready && (
        <div className="mt-3 rounded-xl border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "#86efac", background: "#f0fdf4", color: "#15803d" }}>
          Ya tienes una base suficiente para leer el mes.
          {completed < total && (
            <span className="font-normal" style={{ color: "#166534" }}>
              {" "}Los pasos que quedan la afinan.
            </span>
          )}
        </div>
      )}

      <ol className="mt-5 space-y-3">
        {steps.map((st, i) => {
          const done = st.state === "completado";
          const attention = st.state === "atencion";
          const body = (
            <>
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={
                  done
                    ? { background: "var(--t-accent)", color: "#fff" }
                    : attention
                      ? { background: "#fef3c7", border: "1.5px solid #f59e0b", color: "#92400e" }
                      : { border: "1.5px solid var(--t-border)", color: "var(--t-dim)" }
                }
              >
                {done ? "✓" : attention ? "!" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--t-text)" }}>
                    {st.title}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      done
                        ? { background: "var(--t-accent-14)", color: "var(--t-accent)" }
                        : attention
                          ? { background: "#fef3c7", color: "#92400e" }
                          : { background: "var(--t-accent-08)", color: "var(--t-dim)" }
                    }
                  >
                    {STATE_LABEL[st.state]}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: "var(--t-muted)" }}>
                  {st.desc}
                </span>
              </span>
              {st.cta && (
                <span aria-hidden className="mt-1 shrink-0 text-xs font-bold" style={{ color: attention ? "#92400e" : "var(--t-accent)" }}>
                  {st.cta.label} →
                </span>
              )}
            </>
          );
          const rowStyle = {
            borderColor: attention ? "#fde68a" : "var(--t-border)",
            background: attention ? "#fffbeb" : "var(--t-bg)",
            opacity: st.state === "pendiente" && !st.cta ? 0.75 : 1,
          };
          return (
            <li key={st.id}>
              {st.cta ? (
                <a
                  href={hrefFor(st.cta)}
                  onClick={() =>
                    trackActivation(user, orgId, "onboarding_step_clicked", "onboarding", { step: i + 1, state: st.state })
                  }
                  className="flex items-start gap-3 rounded-xl border p-4 transition"
                  style={rowStyle}
                >
                  {body}
                </a>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border p-4" style={rowStyle}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Feedback del piloto: solo cuando ya avanzó al menos un paso */}
      {steps.some((st) => st.state === "completado") && <PilotFeedback user={user} orgId={orgId} surface="onboarding" />}
    </section>
  );
}
