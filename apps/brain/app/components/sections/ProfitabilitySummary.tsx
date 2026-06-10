"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { T, tableWrap, btnPrimary, fmt } from "../theme";
import type { User } from "firebase/auth";
import { trackActivation } from "@/lib/track-activation";

/**
 * Resumen de rentabilidad del mes (solo lectura). Cruza lo ya existente:
 *   - sueldo recomendado desde el snapshot de treasury (caja),
 *   - margen bruto del mes desde ventas manuales × escandallos.
 * Carga /api/org/[orgId]/profitability-summary. Si algo falta, guía con CTAs.
 *
 * Se monta en dos sitios: dentro de Márgenes (variant="margins", defecto) y en
 * el hub /org/[orgId] (variant="hub"). En el hub los empty states enlazan a las
 * secciones (?section=…) porque el formulario de ventas no está "abajo".
 */
type Summary = {
  period: string;
  cash: { present: boolean; month: string | null; sueldoRecomendado: number | null; sueldoMaximo: number | null; semaforo: string | null };
  margin: {
    hasRecipes: boolean; hasSales: boolean; grossMarginMonth: number;
    topProduct: { name: string; gross: number } | null;
    toReview: { count: number; names: string[] }; pendingEscandallos: number;
    /** Fuente del margen: tickets POS reales → ventas manuales → estimación. */
    source?: "pos" | "manual" | "estimate" | "none";
    pos?: {
      revenue: number; unitsSold: number;
      missingEscandallo: { count: number; names: string[]; revenue: number };
    } | null;
  };
};

type Props = {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
  variant?: "margins" | "hub";
};

const SEMAFORO_COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#ca8a04", rojo: "#dc2626" };

export default function ProfitabilitySummary({ user, orgId, authedFetch, variant = "margins" }: Props) {
  const hub = variant === "hub";
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const seenTracked = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/profitability-summary`);
      if (r.ok) {
        setData(await r.json());
        // una sola vez por montaje: el resumen llegó a verse con datos
        if (!seenTracked.current) {
          seenTracked.current = true;
          trackActivation(user, orgId, "profitability_summary_seen", variant);
        }
      }
    } catch (e) { console.error("Profitability summary:", e); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch, variant]);

  useEffect(() => { load(); }, [load]);

  // Se monta en silencio: si falla, el resto de Márgenes sigue dando contexto.
  if (loading || !data) return null;

  const { cash, margin } = data;
  const source = margin.source ?? (margin.hasSales ? "manual" : margin.hasRecipes ? "estimate" : "none");
  const missing = source === "pos" ? margin.pos?.missingEscandallo : null;

  const actions: string[] = [];
  if (missing && missing.count > 0) actions.push("Crea el escandallo de los productos que ya vendes en el TPV");
  if (source !== "pos" && margin.hasRecipes) actions.push("Sube ventas de tus productos con más margen");
  if (margin.toReview.count > 0) actions.push("Revisa productos con margen bajo");
  if (margin.pendingEscandallos > 0) actions.push("Completa escandallos pendientes");
  if (cash.semaforo === "amarillo" || cash.semaforo === "rojo") actions.push("Mantén colchón antes de cobrarte más");

  const SOURCE_CHIP: Record<string, { label: string; bg: string; color: string } | undefined> = {
    pos: { label: "Ventas reales del TPV", bg: "#dcfce7", color: "#15803d" },
    manual: { label: "Ventas manuales", bg: "#fef9c3", color: "#a16207" },
    estimate: { label: "Estimación por escandallo", bg: "#e0e7ff", color: "#4338ca" },
  };
  const chip = SOURCE_CHIP[source];

  return (
    <section style={{ ...tableWrap, padding: 24, ...(hub ? { marginTop: 32 } : { marginBottom: 28 }), background: T.accent14, borderColor: T.accent40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 4px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Resumen de rentabilidad del mes</h2>
        {chip && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: chip.bg, color: chip.color }}>
            {chip.label}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: T.muted, margin: "0 0 20px" }}>
        Enverde cruza tu caja, tus costes y las unidades vendidas para ayudarte a decidir cuánto puedes cobrarte.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {/* Sueldo recomendado */}
        <Card label="Sueldo recomendado">
          {cash.present && cash.sueldoRecomendado !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{fmt(cash.sueldoRecomendado)}€</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                {cash.semaforo && (
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 5, background: SEMAFORO_COLOR[cash.semaforo] || T.dim }} />
                )}
                máx. sostenible {cash.sueldoMaximo !== null ? `${fmt(cash.sueldoMaximo)}€` : "—"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>Sube tu extracto para calcular tu sueldo.</div>
              <button
                onClick={() => {
                  trackActivation(user, orgId, "cta_upload_statement_clicked", variant);
                  window.location.href = `/org/${orgId}/treasury/start`;
                }}
                style={{ ...btnPrimary, cursor: "pointer", fontSize: 12, padding: "6px 12px" }}
              >
                Subir extracto
              </button>
            </>
          )}
        </Card>

        {/* Margen bruto del mes (fuente: POS real / ventas manuales / estimación) */}
        <Card label={source === "pos" ? "Margen bruto del mes" : "Margen bruto estimado"}>
          {margin.hasSales ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmt(margin.grossMarginMonth)}€</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                {source === "pos" && margin.pos
                  ? `ventas reales del TPV · ${fmt(margin.pos.revenue)}€ vendidos`
                  : "este mes, según tus ventas manuales"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.dim }}>—</div>
              {hub ? (
                <a
                  href={margin.hasRecipes ? "/?section=margins" : "/?section=recipes"}
                  onClick={() =>
                    trackActivation(user, orgId, margin.hasRecipes ? "cta_manual_sales_clicked" : "cta_recipes_clicked", variant)
                  }
                  style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: T.accent, marginTop: 6, textDecoration: "underline" }}
                >
                  {margin.hasRecipes ? "Añadir ventas manuales" : "Preparar escandallos"}
                </a>
              ) : (
                <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                  {margin.hasRecipes ? "Añade ventas manuales abajo" : "Prepara tus escandallos"}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Producto que más aporta */}
        <Card label="Producto que más aporta">
          {margin.topProduct ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{margin.topProduct.name}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{fmt(margin.topProduct.gross)}€ de margen</div>
            </>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: T.dim }}>—</div>
          )}
        </Card>

        {/* Productos a revisar */}
        <Card label="Productos a revisar">
          <div style={{ fontSize: 22, fontWeight: 800, color: margin.toReview.count > 0 ? "#dc2626" : "#16a34a" }}>{margin.toReview.count}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
            {margin.toReview.count > 0 ? margin.toReview.names.join(", ") : "margen sano"}
          </div>
        </Card>
      </div>

      {missing && missing.count > 0 && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fcd34d", fontSize: 13, color: "#92400e" }}>
          <strong>{missing.count} producto{missing.count === 1 ? "" : "s"} vendido{missing.count === 1 ? "" : "s"} sin escandallo</strong>
          {" — "}{fmt(missing.revenue)}€ de ventas sin margen calculado ({missing.names.join(", ")}).
          {" "}No estimamos ese margen: crea sus escandallos para verlo de verdad.
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Para mejorar tu sueldo</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: T.muted, fontSize: 13, lineHeight: 1.8 }}>
            {actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.02em", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}
