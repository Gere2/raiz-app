"use client";

import { useState, useEffect, useCallback } from "react";
import { Kpi } from "../ui";
import {
  T, page, pageTitle, pageSub, tableWrap, tableHead,
  tbl, trHead, trBody, th, td, tdR, badge, btnSmall, btnPrimary, fmt,
} from "../theme";
import type { User } from "firebase/auth";

/* ─── Types ── */
type MarginItem = {
  productId: string; productName: string; category: string;
  unitsSold: number; revenue: number; unitCost: number;
  unitMargin: number; foodCostPct: number; totalProfit: number;
  hasCostData: boolean;
};

type CategoryBreakdown = {
  category: string; items: number; revenue: number;
  avgFoodCost: number; totalProfit: number; avgMargin: number;
};

type MarginAlert = {
  type: "critical" | "warning" | "info";
  title: string; message: string; productId?: string;
};

type MarginData = {
  kpis: {
    totalRevenue: number; totalCost: number; grossProfit: number;
    avgFoodCostPct: number; avgMarginPct: number; bestMarginProduct: string;
    worstMarginProduct: string; productsAboveThreshold: number; days: number;
  };
  items: MarginItem[];
  categories: CategoryBreakdown[];
  alerts: MarginAlert[];
  trend: Array<{ period: string; revenue: number; cost: number; margin: number }>;
};

interface MarginsProps {
  user: User;
  orgId: string;
  fcColor: (p: number) => string;
  fcBg: (p: number) => string;
  fcLabel: (p: number) => string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
}

export default function MarginsSection({ user, orgId, fcColor, fcBg, fcLabel, authedFetch }: MarginsProps) {
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<"profit" | "foodCost" | "revenue">("profit");
  const [catFilter, setCatFilter] = useState("all");
  const [view, setView] = useState<"products" | "categories">("products");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/margins?days=${days}`);
      if (r.ok) { const d = await r.json(); setData(d); }
    } catch (e) { console.error("Margins fetch:", e); }
    finally { setLoading(false); }
  }, [user, orgId, days, authedFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Cargando análisis de márgenes...</div>;
  // Empty state honesto: o la API no devolvió datos, o aún no hay productos con
  // ventas/costes. En vez de un dashboard en ceros (o "Sin datos"), guiamos al
  // dueño a lo que falta para poder calcular márgenes.
  if (!data || data.items.length === 0) return <MarginsEmptyState />;

  const sorted = [...data.items]
    .filter(i => catFilter === "all" || i.category === catFilter)
    .sort((a, b) => {
      if (sortBy === "profit") return b.totalProfit - a.totalProfit;
      if (sortBy === "foodCost") return b.foodCostPct - a.foodCostPct;
      return b.revenue - a.revenue;
    });

  const categories = [...new Set(data.items.map(i => i.category).filter(Boolean))];

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={pageTitle}>Dashboard de márgenes</h1>
          <p style={pageSub}>Análisis detallado de rentabilidad por producto y categoría</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, background: T.surface }}>
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </select>
          <button onClick={fetchData} disabled={loading} style={{ ...btnSmall, color: T.accent, borderColor: T.accent40 }}>
            {loading ? "..." : "↻"}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label="Ingresos totales" value={`${fmt(data.kpis.totalRevenue)}€`} color="#16a34a" />
        <Kpi label="Coste total" value={`${fmt(data.kpis.totalCost)}€`} color="#dc2626" />
        <Kpi label="Beneficio bruto" value={`${fmt(data.kpis.grossProfit)}€`} color={data.kpis.grossProfit >= 0 ? "#16a34a" : "#dc2626"} />
        <Kpi label="Food cost medio" value={`${fmt(data.kpis.avgFoodCostPct)}%`} color={fcColor(data.kpis.avgFoodCostPct)} badge={fcLabel(data.kpis.avgFoodCostPct)} badgeBg={fcBg(data.kpis.avgFoodCostPct)} />
        <Kpi label="Margen medio" value={`${fmt(data.kpis.avgMarginPct)}%`} color={data.kpis.avgMarginPct >= 65 ? "#16a34a" : "#ca8a04"} />
        <Kpi label="Sobre umbral" value={String(data.kpis.productsAboveThreshold)} color={data.kpis.productsAboveThreshold > 0 ? "#dc2626" : "#16a34a"} sub="productos con FC alto" />
      </div>

      {/* ── Alertas ── */}
      {data.alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: T.text }}>Alertas</div>
          {data.alerts.map((a, i) => (
            <div key={i} style={{
              padding: "10px 14px", marginBottom: 6, borderRadius: 8, fontSize: 12,
              background: a.type === "critical" ? T.dangerBg : a.type === "warning" ? T.warningBg : "#f0f9ff",
              color: a.type === "critical" ? "#991b1b" : a.type === "warning" ? "#854d0e" : "#1e40af",
              border: `1px solid ${a.type === "critical" ? "#fecaca" : a.type === "warning" ? "#fde68a" : "#bfdbfe"}`,
            }}>
              <strong>{a.title}</strong> — {a.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Tendencia (barras simples) ── */}
      {data.trend.length > 1 && (
        <div style={{ ...tableWrap, marginBottom: 24, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: T.text }}>Tendencia de margen</div>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 120 }}>
            {data.trend.map((t, i) => {
              const maxRev = Math.max(...data.trend.map(x => x.revenue), 1);
              const h = (t.revenue / maxRev) * 100;
              const costH = (t.cost / maxRev) * 100;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", position: "relative", height: 100 }}>
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${h}%`, background: "#16a34a20", borderRadius: "4px 4px 0 0" }} />
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${costH}%`, background: "#dc262620", borderRadius: "4px 4px 0 0" }} />
                  </div>
                  <span style={{ fontSize: 9, color: T.dim, whiteSpace: "nowrap" }}>{t.period}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: T.dim }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#16a34a20", borderRadius: 2, marginRight: 4 }} />Ingresos</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#dc262620", borderRadius: 2, marginRight: 4 }} />Costes</span>
          </div>
        </div>
      )}

      {/* ── Best / Worst ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ ...tableWrap, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Mejor margen</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>{data.kpis.bestMarginProduct || "—"}</div>
        </div>
        <div style={{ ...tableWrap, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Peor margen</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#dc2626" }}>{data.kpis.worstMarginProduct || "—"}</div>
        </div>
      </div>

      {/* ── Vista toggle + filtros ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => setView("products")} style={{ ...btnSmall, ...(view === "products" ? { background: T.accent14, color: T.accent, borderColor: T.accent } : {}) }}>Por producto</button>
        <button onClick={() => setView("categories")} style={{ ...btnSmall, ...(view === "categories" ? { background: T.accent14, color: T.accent, borderColor: T.accent } : {}) }}>Por categoría</button>
        <div style={{ flex: 1 }} />
        {view === "products" && (
          <>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, background: T.surface }}>
              <option value="all">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, background: T.surface }}>
              <option value="profit">Ordenar por beneficio</option>
              <option value="foodCost">Ordenar por food cost</option>
              <option value="revenue">Ordenar por ingresos</option>
            </select>
          </>
        )}
      </div>

      {/* ── Tabla productos ── */}
      {view === "products" && (
        <div style={tableWrap}>
          <table style={tbl}>
            <thead><tr style={trHead}>
              {["Producto", "Categoría", "Uds.", "Ingresos", "Coste ud.", "Margen ud.", "FC%", "Beneficio total"].map((h, i) =>
                <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {sorted.map(item => (
                <tr key={item.productId} style={trBody}>
                  <td style={td}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.productName}</div>
                    {!item.hasCostData && <div style={{ fontSize: 10, color: "#ca8a04" }}>sin coste asignado</div>}
                  </td>
                  <td style={{ ...td, color: T.muted, fontSize: 12 }}>{item.category || "—"}</td>
                  <td style={tdR}>{item.unitsSold}</td>
                  <td style={tdR}>{fmt(item.revenue)}€</td>
                  <td style={{ ...tdR, color: item.hasCostData ? T.text : T.dim }}>{item.hasCostData ? `${fmt(item.unitCost)}€` : "—"}</td>
                  <td style={{ ...tdR, color: item.unitMargin >= 0 ? "#16a34a" : "#dc2626" }}>{item.hasCostData ? `${fmt(item.unitMargin)}€` : "—"}</td>
                  <td style={tdR}>
                    {item.hasCostData
                      ? <span style={{ ...badge, color: fcColor(item.foodCostPct), background: fcBg(item.foodCostPct) }}>{fmt(item.foodCostPct)}%</span>
                      : <span style={{ color: T.dim }}>—</span>}
                  </td>
                  <td style={{ ...tdR, fontWeight: 600, color: item.totalProfit >= 0 ? "#16a34a" : "#dc2626" }}>
                    {item.hasCostData ? `${fmt(item.totalProfit)}€` : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.dim }}>Sin datos para el período seleccionado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tabla categorías ── */}
      {view === "categories" && (
        <div style={tableWrap}>
          <table style={tbl}>
            <thead><tr style={trHead}>
              {["Categoría", "Productos", "Ingresos", "Food cost medio", "Margen medio", "Beneficio total"].map((h, i) =>
                <th key={i} style={{ ...th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {data.categories.map(cat => (
                <tr key={cat.category} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, fontSize: 13 }}>{cat.category || "Sin categoría"}</td>
                  <td style={tdR}>{cat.items}</td>
                  <td style={tdR}>{fmt(cat.revenue)}€</td>
                  <td style={tdR}>
                    <span style={{ ...badge, color: fcColor(cat.avgFoodCost), background: fcBg(cat.avgFoodCost) }}>{fmt(cat.avgFoodCost)}%</span>
                  </td>
                  <td style={{ ...tdR, color: cat.avgMargin >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(cat.avgMargin)}%</td>
                  <td style={{ ...tdR, fontWeight: 600, color: cat.totalProfit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(cat.totalProfit)}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Empty state honesto (sin ventas/costes todavía) ──────────────────────
 * Habla como dueño, no como técnico: nada de arrays vacíos, tickets sin orgId
 * ni dashboards en ceros. Guía a Productos y Escandallos, que es lo que falta
 * para que Enverde pueda calcular qué producto paga el sueldo. */
function MarginsEmptyState() {
  return (
    <div style={page}>
      <h1 style={pageTitle}>Márgenes</h1>
      <p style={pageSub}>Qué productos pagan tu sueldo y cuáles solo te dan trabajo</p>
      <div style={{ ...tableWrap, maxWidth: 560, margin: "24px auto 0", padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 12 }}>
          Aún no podemos calcular tus márgenes
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted, marginBottom: 24 }}>
          Para saber qué productos pagan tu sueldo necesitamos ventas y costes por
          producto. Empieza añadiendo productos y escandallos. Después, cuando registres
          ventas, Enverde podrá decirte qué deja margen y qué solo te da trabajo.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => { window.location.href = "/?section=products"; }} style={{ ...btnPrimary, cursor: "pointer" }}>
            Añadir productos
          </button>
          <button onClick={() => { window.location.href = "/?section=recipes"; }} style={{ ...btnSmall, cursor: "pointer", color: T.accent, borderColor: T.accent40 }}>
            Preparar escandallos
          </button>
        </div>
      </div>
    </div>
  );
}
