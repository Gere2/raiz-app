"use client";

import { useState, useEffect, useCallback, type ReactNode, type CSSProperties } from "react";
import { T, tableWrap, btnPrimary, fmt } from "../theme";
import type { User } from "firebase/auth";
import { trackActivation } from "@/lib/track-activation";

/**
 * Cafetería demo (solo lectura) — "momento wow" para orgs vacías en el hub
 * /org/[orgId]. Datos 100% hardcoded en este archivo y cálculos en cliente:
 * NO hay seed, NO se escribe en Firestore, NO se mezclan datos demo con datos
 * reales (auditoría: opción A read-only frente a seed-en-org u org demo).
 * El único request es el mismo GET read-only de profitability-summary que usan
 * ProfitabilitySummary y ProfitabilityOnboarding, solo para decidir visibilidad:
 *   - org completa (caja + escandallos + ventas) → no se muestra,
 *   - org incompleta o fetch fallido → se muestra (la org nueva es el público).
 * El sueldo demo es una cifra inventada y etiquetada como ejemplo; no pasa por
 * la lógica real de treasury ni de sueldo.
 */

type DemoProduct = { name: string; price: number; cost: number; units: number };

const DEMO_PRODUCTS: DemoProduct[] = [
  { name: "Café con leche", price: 2.5, cost: 0.85, units: 120 },
  { name: "Cortado", price: 2.2, cost: 0.65, units: 80 },
  { name: "Matcha latte", price: 3.5, cost: 1.1, units: 45 },
  { name: "Cookie", price: 2.8, cost: 1.2, units: 35 },
  { name: "Zumo natural", price: 4.0, cost: 2.4, units: 25 },
];

// Sueldo de ejemplo (cifra fija, NO sale de la lógica real de treasury).
const DEMO_SUELDO = { recomendado: 950, maximo: 1200 };

const REVIEW_THRESHOLD = 50; // margen % por debajo del cual el producto se marca "revisar"

type Props = {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
};

export default function ProfitabilityDemo({ user, orgId, authedFetch }: Props) {
  // complete=false por defecto: si el fetch falla, la demo se muestra igual
  // (la org vacía es quien más la necesita).
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/profitability-summary`);
      if (r.ok) {
        const d = await r.json();
        setComplete(Boolean(d?.cash?.present) && Boolean(d?.margin?.hasRecipes) && Boolean(d?.margin?.hasSales));
      }
    } catch (e) {
      console.error("Profitability demo:", e);
    } finally {
      setLoading(false);
    }
  }, [user, orgId, authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || complete) return null;

  // Cálculos demo (mismas fórmulas que enseña el producto, sobre datos fake):
  // margen unitario = precio − coste; margen bruto = unitario × unidades.
  const rows = DEMO_PRODUCTS.map((p) => {
    const unitMargin = p.price - p.cost;
    const marginPct = p.price > 0 ? (unitMargin / p.price) * 100 : 0;
    return { ...p, unitMargin, marginPct, gross: unitMargin * p.units, review: marginPct < REVIEW_THRESHOLD };
  }).sort((a, b) => b.gross - a.gross);

  const grossMonth = rows.reduce((acc, r) => acc + r.gross, 0);
  const top = rows[0];
  const toReview = rows.filter((r) => r.review);

  if (!open) {
    return (
      <section className="mt-5 rounded-2xl border p-6" style={{ borderColor: "var(--t-border)", background: "var(--t-surface)" }}>
        <h2 className="text-base font-bold" style={{ color: "var(--t-text)" }}>
          ¿Quieres ver cómo quedaría con datos de ejemplo?
        </h2>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--t-muted)" }}>
          Sin rellenar nada: una cafetería demo con productos, costes y ventas del mes
          para ver en 30 segundos qué te dirá Enverde con tus datos.
        </p>
        <button
          onClick={() => {
            trackActivation(user, orgId, "demo_opened", "demo");
            setOpen(true);
          }}
          style={{ ...btnPrimary, marginTop: 14, cursor: "pointer" }}
        >
          Ver cafetería demo
        </button>
      </section>
    );
  }

  return (
    <section style={{ ...tableWrap, padding: 24, marginTop: 20, background: T.accent14, borderColor: T.accent40 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Cafetería demo</h2>
        <span style={{ borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff" }}>
          Datos de ejemplo
        </span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: T.muted, margin: "6px 0 0" }}>
        Estos datos son de ejemplo. No afectan a tu negocio.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: T.muted, margin: "4px 0 20px" }}>
        Con tus costes y unidades vendidas, Enverde te dice qué productos sostienen tu sueldo.
      </p>

      {/* Mismas 4 cards que el resumen real, con cifras demo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Card label="Sueldo recomendado (ejemplo)">
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{fmt(DEMO_SUELDO.recomendado)}€</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 5, background: "#16a34a" }} />
            máx. sostenible {fmt(DEMO_SUELDO.maximo)}€ · cifra de ejemplo
          </div>
        </Card>
        <Card label="Margen bruto estimado">
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmt(grossMonth)}€</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>este mes, según las ventas demo</div>
        </Card>
        <Card label="Producto que más aporta">
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{top.name}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{fmt(top.gross)}€ de margen</div>
        </Card>
        <Card label="Productos a revisar">
          <div style={{ fontSize: 22, fontWeight: 800, color: toReview.length > 0 ? "#dc2626" : "#16a34a" }}>{toReview.length}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
            {toReview.length > 0 ? toReview.map((r) => r.name).join(", ") : "margen sano"}
          </div>
        </Card>
      </div>

      {/* Ranking por margen bruto del mes */}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Producto", "Precio", "Coste", "Margen", "Ventas", "Margen del mes", ""].map((h) => (
                <th key={h} style={{ textAlign: h === "Producto" ? "left" : "right", padding: "6px 8px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em", color: T.dim, borderBottom: `1px solid ${T.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ padding: "8px", fontWeight: 600, color: T.text, borderBottom: `1px solid ${T.border}` }}>{r.name}</td>
                <td style={cell}>{fmt(r.price)}€</td>
                <td style={cell}>{fmt(r.cost)}€</td>
                <td style={cell}>
                  {fmt(r.unitMargin)}€ <span style={{ color: T.dim }}>({Math.round(r.marginPct)}%)</span>
                </td>
                <td style={cell}>{r.units} uds</td>
                <td style={{ ...cell, fontWeight: 700, color: T.text }}>{fmt(r.gross)}€</td>
                <td style={{ ...cell, textAlign: "left" }}>
                  {r.review && (
                    <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#dc2626" }}>
                      revisar
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 20 }}>
        <button
          onClick={() => {
            trackActivation(user, orgId, "demo_closed", "demo");
            setOpen(false);
          }}
          style={{ ...btnPrimary, cursor: "pointer" }}
        >
          Volver a mi negocio
        </button>
        <a
          href={`/org/${orgId}/treasury/start`}
          onClick={() => trackActivation(user, orgId, "cta_upload_statement_clicked", "demo")}
          style={{ fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
        >
          Empezar con mis datos: subir extracto
        </a>
      </div>
    </section>
  );
}

const cell: CSSProperties ={ padding: "8px", textAlign: "right", color: T.muted, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.02em", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}
