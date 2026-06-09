"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { T, tableWrap, btnPrimary, fmt } from "../theme";
import type { User } from "firebase/auth";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/profitability-summary`);
      if (r.ok) setData(await r.json());
    } catch (e) { console.error("Profitability summary:", e); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  // Se monta en silencio: si falla, el resto de Márgenes sigue dando contexto.
  if (loading || !data) return null;

  const { cash, margin } = data;
  const actions: string[] = [];
  if (margin.hasRecipes) actions.push("Sube ventas de tus productos con más margen");
  if (margin.toReview.count > 0) actions.push("Revisa productos con margen bajo");
  if (margin.pendingEscandallos > 0) actions.push("Completa escandallos pendientes");
  if (cash.semaforo === "amarillo" || cash.semaforo === "rojo") actions.push("Mantén colchón antes de cobrarte más");

  return (
    <section style={{ ...tableWrap, padding: 24, ...(hub ? { marginTop: 32 } : { marginBottom: 28 }), background: T.accent14, borderColor: T.accent40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: "0 0 4px" }}>Resumen de rentabilidad del mes</h2>
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
              <button onClick={() => { window.location.href = `/org/${orgId}/treasury/start`; }} style={{ ...btnPrimary, cursor: "pointer", fontSize: 12, padding: "6px 12px" }}>
                Subir extracto
              </button>
            </>
          )}
        </Card>

        {/* Margen bruto estimado */}
        <Card label="Margen bruto estimado">
          {margin.hasSales ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmt(margin.grossMarginMonth)}€</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>este mes, según tus ventas</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.dim }}>—</div>
              {hub ? (
                <a
                  href={margin.hasRecipes ? "/?section=margins" : "/?section=recipes"}
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
