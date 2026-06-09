"use client";

import { useState, useEffect, useCallback } from "react";
import { T, tableWrap, tbl, trHead, trBody, th, td, tdR, badge, btnPrimary, btnSmall, fmt } from "../theme";
import type { User } from "firebase/auth";
import type { Recipe } from "@/lib/types";

/**
 * Impacto mensual estimado: cruza el margen del escandallo con las unidades
 * vendidas que el dueño registra a mano (orgs/{orgId}/manual_sales). NO es POS.
 *   unitMargin = sellingPrice − totalCost
 *   grossMarginForPeriod = unitMargin × unitsSold
 * Se ordena por margen bruto del periodo (lo que más aporta arriba).
 */
type Props = {
  recipes: Recipe[];
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
};

const periodLabel = () => new Date().toLocaleDateString("es", { month: "long", year: "numeric" });

export default function ManualSalesImpact({ recipes, user, orgId, authedFetch }: Props) {
  const [units, setUnits] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/manual-sales`);
      if (r.ok) {
        const d = await r.json();
        const map: Record<string, number> = {};
        for (const l of (d.lines || []) as Array<{ recipeId?: string; unitsSold?: number }>) {
          if (l.recipeId) map[l.recipeId] = Number(l.unitsSold) || 0;
        }
        setUnits(map);
      } else setUnits({});
    } catch (e) { console.error("Manual sales fetch:", e); setUnits({}); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const openForm = () => {
    const d: Record<string, string> = {};
    for (const r of recipes) { const u = units?.[r.id]; d[r.id] = u ? String(u) : ""; }
    setDraft(d);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const lines = recipes
        .map(r => ({ recipeId: r.id, productName: r.productName || r.name, unitsSold: Math.round(Number(draft[r.id]) || 0) }))
        .filter(l => l.unitsSold > 0);
      const r = await authedFetch(user, `/api/org/${orgId}/manual-sales`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (r.ok) { setEditing(false); await load(); }
    } catch (e) { console.error("Manual sales save:", e); }
    finally { setSaving(false); }
  };

  const rows = recipes.map(r => {
    const price = Number(r.sellingPrice) || 0;
    const cost = Number(r.totalCost) || 0;
    const u = units?.[r.id] || 0;
    const computable = price > 0 && cost > 0;
    const unitMargin = computable ? price - cost : null;
    const marginPct = computable ? ((price - cost) / price) * 100 : null;
    const gross = computable ? (price - cost) * u : null;
    return { id: r.id, name: r.productName || r.name, units: u, unitMargin, marginPct, gross };
  }).filter(r => r.units > 0)
    .sort((a, b) => (b.gross ?? -1) - (a.gross ?? -1));

  const totalGross = rows.reduce((s, r) => s + (r.gross || 0), 0);
  const hasSales = rows.length > 0;

  const sectionHead = (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: "0 0 4px" }}>Qué productos aportan más margen</h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: T.muted, margin: "0 0 16px" }}>
        Este cálculo combina tus escandallos con las unidades vendidas que registres. No
        sustituye al POS, pero te da una primera lectura de qué productos sostienen tu sueldo.
      </p>
    </>
  );

  if (loading) {
    return <div style={{ marginTop: 32 }}>{sectionHead}<p style={{ color: T.dim, fontSize: 13 }}>Cargando ventas…</p></div>;
  }

  // Formulario de entrada manual
  if (editing) {
    return (
      <div style={{ marginTop: 32 }}>
        {sectionHead}
        <div style={{ ...tableWrap, padding: 16 }}>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Unidades vendidas en {periodLabel()}</div>
          {recipes.map(r => {
            const price = Number(r.sellingPrice) || 0;
            const cost = Number(r.totalCost) || 0;
            const um = price > 0 && cost > 0 ? price - cost : null;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ flex: 1, fontSize: 13, color: T.text }}>
                  {r.productName || r.name}
                  <span style={{ color: T.dim, fontSize: 11, marginLeft: 8 }}>
                    {um !== null ? `margen ${fmt(um)}€/ud` : "completa el escandallo"}
                  </span>
                </div>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={draft[r.id] ?? ""}
                  onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                  placeholder="0"
                  style={{ width: 90, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13, background: T.surface, textAlign: "right" }}
                />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{ ...btnPrimary, cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Guardando…" : "Guardar ventas"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ ...btnSmall, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  // Sin ventas registradas todavía: prompt + CTA
  if (!hasSales) {
    return (
      <div style={{ marginTop: 32 }}>
        {sectionHead}
        <div style={{ ...tableWrap, padding: 24, textAlign: "center", background: T.accent14, borderColor: T.accent40 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: T.text, margin: "0 0 16px" }}>
            Ya sabemos el margen estimado por producto. Añade unidades vendidas para saber qué
            productos aportan más margen al mes.
          </p>
          <button onClick={openForm} style={{ ...btnPrimary, cursor: "pointer" }}>Añadir ventas manuales</button>
        </div>
      </div>
    );
  }

  // Ranking de impacto del periodo
  return (
    <div style={{ marginTop: 32 }}>
      {sectionHead}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: T.text }}>
          Margen bruto estimado en {periodLabel()}:{" "}
          <strong style={{ color: totalGross >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(totalGross)}€</strong>
        </div>
        <button onClick={openForm} style={{ ...btnSmall, cursor: "pointer", color: T.accent, borderColor: T.accent40 }}>Editar ventas</button>
      </div>
      <div style={tableWrap}>
        <table style={tbl}>
          <thead><tr style={trHead}>
            {["#", "Producto", "Unidades vendidas", "Margen unitario", "Margen %", "Margen bruto estimado"].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={trBody}>
                <td style={{ ...td, color: T.dim, width: 32 }}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 500, fontSize: 13 }}>{r.name}</td>
                <td style={tdR}>{r.units}</td>
                <td style={{ ...tdR, color: r.unitMargin === null ? T.dim : r.unitMargin >= 0 ? "#16a34a" : "#dc2626" }}>
                  {r.unitMargin === null ? "—" : `${fmt(r.unitMargin)}€`}
                </td>
                <td style={tdR}>
                  {r.marginPct === null ? <span style={{ color: T.dim }}>—</span> : <span style={{ ...badge }}>{fmt(r.marginPct)}%</span>}
                </td>
                <td style={{ ...tdR, fontWeight: 700, color: r.gross === null ? T.dim : r.gross >= 0 ? "#16a34a" : "#dc2626" }}>
                  {r.gross === null ? "—" : `${fmt(r.gross)}€`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: T.dim, marginTop: 12, lineHeight: 1.6 }}>
        Margen bruto estimado = margen unitario del escandallo × unidades vendidas. Es una
        estimación a partir de tus costes y de las ventas que registres, no del POS.
      </p>
    </div>
  );
}
