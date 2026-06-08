"use client";

import { useState, useEffect, useCallback } from "react";
import { Kpi, Overlay, Fld } from "../ui";
import {
  T, page, pageTitle, pageSub, tableWrap, tableHead,
  tbl, trHead, trBody, th, td, tdR, badge, btnSmall, btnPrimary, input, fmt,
} from "../theme";
import type { User } from "firebase/auth";

/* ─── Types ── */
type InventoryItem = {
  id: string; catalogItemId: string; name: string;
  currentStock: number; unit: string; minStock: number;
  maxStock: number; lastRestockAt: string | null;
  avgDailyUsage: number; daysUntilEmpty: number;
  status: "ok" | "low" | "critical" | "overstock";
  supplier: string; category: string;
};

type Movement = {
  id: string; itemId: string; itemName: string;
  type: "entrada" | "salida" | "merma" | "ajuste";
  qty: number; previousStock: number; newStock: number;
  notes: string; date: string; userName: string;
};

type WasteEntry = {
  id: string; itemId: string; itemName: string;
  qty: number; unit: string; reason: string;
  costLoss: number; date: string;
};

type InventoryData = {
  items: InventoryItem[];
  recentMovements: Movement[];
  wasteThisMonth: { totalCostLoss: number; totalEntries: number; topWasteItems: Array<{ name: string; costLoss: number }> };
  kpis: { totalItems: number; lowStockCount: number; criticalCount: number; overstockCount: number; wasteRate: number; totalStockValue: number };
};

interface InventoryProps {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
}

export default function InventorySection({ user, orgId, authedFetch }: InventoryProps) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "low" | "critical" | "overstock">("all");
  const [showMovement, setShowMovement] = useState(false);
  const [showWaste, setShowWaste] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Movement form
  const [mvType, setMvType] = useState<"entrada" | "salida">("entrada");
  const [mvQty, setMvQty] = useState(0);
  const [mvNotes, setMvNotes] = useState("");
  const [mvItemId, setMvItemId] = useState("");

  // Waste form
  const [wasteItemId, setWasteItemId] = useState("");
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteReason, setWasteReason] = useState("");

  // Min stock form
  const [editMinStock, setEditMinStock] = useState<string | null>(null);
  const [minStockVal, setMinStockVal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/inventory-brain`);
      if (r.ok) { const d = await r.json(); setData(d); }
    } catch (e) { console.error("Inventory fetch:", e); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const recordMovement = async () => {
    if (!mvItemId || mvQty <= 0) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/inventory-brain/movement`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: mvItemId, type: mvType, qty: mvQty, notes: mvNotes }),
      });
      setShowMovement(false); setMvQty(0); setMvNotes(""); setMvItemId("");
      await fetchData();
    } finally { setSaving(false); }
  };

  const recordWaste = async () => {
    if (!wasteItemId || wasteQty <= 0) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/inventory-brain/waste`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: wasteItemId, qty: wasteQty, reason: wasteReason }),
      });
      setShowWaste(false); setWasteQty(0); setWasteReason(""); setWasteItemId("");
      await fetchData();
    } finally { setSaving(false); }
  };

  const updateMinStock = async (itemId: string, minStock: number) => {
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/inventory-brain/${itemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minStock }),
      });
      setEditMinStock(null);
      await fetchData();
    } finally { setSaving(false); }
  };

  if (loading && !data) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Cargando inventario...</div>;
  if (!data) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Sin datos de inventario.</div>;

  const filtered = data.items.filter(i => filter === "all" || i.status === filter);

  const statusColor = (s: string) => s === "critical" ? "#dc2626" : s === "low" ? "#ca8a04" : s === "overstock" ? "#2563eb" : "#16a34a";
  const statusBg = (s: string) => s === "critical" ? T.dangerBg : s === "low" ? T.warningBg : s === "overstock" ? T.infoBg : T.successBg;
  const statusLabel = (s: string) => s === "critical" ? "Crítico" : s === "low" ? "Bajo" : s === "overstock" ? "Exceso" : "OK";

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={pageTitle}>Gestión de inventario</h1>
          <p style={pageSub}>Control de stock, alertas y seguimiento de mermas</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowMovement(true)} style={btnPrimary}>+ Movimiento</button>
          <button onClick={() => setShowWaste(true)} style={{ ...btnSmall, color: "#dc2626", borderColor: "#dc262640" }}>+ Merma</button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label="Total artículos" value={String(data.kpis.totalItems)} />
        <Kpi label="Stock bajo" value={String(data.kpis.lowStockCount)} color={data.kpis.lowStockCount > 0 ? "#ca8a04" : "#16a34a"} />
        <Kpi label="Crítico" value={String(data.kpis.criticalCount)} color={data.kpis.criticalCount > 0 ? "#dc2626" : "#16a34a"} />
        <Kpi label="Exceso stock" value={String(data.kpis.overstockCount)} color={data.kpis.overstockCount > 0 ? "#2563eb" : T.dim} />
        <Kpi label="Merma mensual" value={`${fmt(data.wasteThisMonth.totalCostLoss)}€`} color="#dc2626" sub={`${data.wasteThisMonth.totalEntries} registros`} />
        <Kpi label="Valor en stock" value={`${fmt(data.kpis.totalStockValue)}€`} color={T.accent} />
      </div>

      {/* ── Waste summary ── */}
      {data.wasteThisMonth.topWasteItems.length > 0 && (
        <div style={{ ...tableWrap, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Top mermas del mes</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {data.wasteThisMonth.topWasteItems.map((w, i) => (
              <div key={i} style={{ padding: "8px 14px", background: T.dangerBg, borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{w.name}</div>
                <div style={{ color: "#dc2626", fontWeight: 600, fontFamily: T.mono }}>{fmt(w.costLoss)}€</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "critical", "low", "overstock"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            ...btnSmall,
            ...(filter === f ? { background: (f === "all" ? T.accent : statusColor(f)) + "14", color: f === "all" ? T.accent : statusColor(f), borderColor: f === "all" ? T.accent : statusColor(f) } : {}),
          }}>
            {f === "all" ? `Todos (${data.items.length})` : `${statusLabel(f)} (${data.items.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {/* ── Inventory table ── */}
      <div style={tableWrap}>
        <table style={tbl}>
          <thead><tr style={trHead}>
            {["Artículo", "Proveedor", "Stock actual", "Mín.", "Uso diario", "Días restantes", "Estado", ""].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={trBody}>
                <td style={td}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                  {item.category && <div style={{ fontSize: 10, color: T.dim }}>{item.category}</div>}
                </td>
                <td style={{ ...td, color: T.muted, fontSize: 12 }}>{item.supplier || "—"}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmt(item.currentStock)} {item.unit}</td>
                <td style={tdR}>
                  {editMinStock === item.id ? (
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <input type="number" value={minStockVal} onChange={e => setMinStockVal(Number(e.target.value))} style={{ ...input, width: 60, fontSize: 12, textAlign: "right" }} />
                      <button onClick={() => updateMinStock(item.id, minStockVal)} disabled={saving} style={btnSmall}>✓</button>
                      <button onClick={() => setEditMinStock(null)} style={btnSmall}>✕</button>
                    </div>
                  ) : (
                    <span onClick={() => { setEditMinStock(item.id); setMinStockVal(item.minStock); }} style={{ cursor: "pointer" }} title="Editar mínimo">
                      {item.minStock > 0 ? `${fmt(item.minStock)} ${item.unit}` : <span style={{ color: T.dim }}>sin def.</span>}
                    </span>
                  )}
                </td>
                <td style={tdR}>{item.avgDailyUsage > 0 ? `${fmt(item.avgDailyUsage)}/${item.unit}` : "—"}</td>
                <td style={{ ...tdR, color: item.daysUntilEmpty <= 3 ? "#dc2626" : item.daysUntilEmpty <= 7 ? "#ca8a04" : T.text }}>
                  {item.daysUntilEmpty > 0 ? `${item.daysUntilEmpty}d` : "—"}
                </td>
                <td style={tdR}>
                  <span style={{ ...badge, color: statusColor(item.status), background: statusBg(item.status) }}>{statusLabel(item.status)}</span>
                </td>
                <td style={{ padding: "12px 8px", textAlign: "right" }}>
                  <button onClick={() => { setMvItemId(item.id); setShowMovement(true); }} style={btnSmall} title="Registrar movimiento">+/-</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.dim }}>Sin artículos{filter !== "all" ? " en este estado" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Movimientos recientes ── */}
      {data.recentMovements.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: T.text }}>Últimos movimientos</div>
          <div style={tableWrap}>
            {data.recentMovements.slice(0, 10).map(mv => (
              <div key={mv.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{mv.itemName}</span>
                  <span style={{ color: T.dim, marginLeft: 8 }}>{mv.notes}</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{
                    fontFamily: T.mono, fontWeight: 600,
                    color: mv.type === "entrada" ? "#16a34a" : mv.type === "merma" ? "#dc2626" : "#ca8a04",
                  }}>
                    {mv.type === "entrada" ? "+" : "-"}{mv.qty}
                  </span>
                  <span style={{ ...badge, fontSize: 10, color: mv.type === "entrada" ? "#16a34a" : mv.type === "merma" ? "#dc2626" : "#ca8a04", background: mv.type === "entrada" ? T.successBg : mv.type === "merma" ? T.dangerBg : T.warningBg }}>
                    {mv.type}
                  </span>
                  <span style={{ color: T.dim, fontSize: 11 }}>{new Date(mv.date).toLocaleDateString("es")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: Movimiento ── */}
      {showMovement && (
        <Overlay onClose={() => setShowMovement(false)}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Registrar movimiento</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Fld label="Artículo">
              <select value={mvItemId} onChange={e => setMvItemId(e.target.value)} style={{ ...input, width: "100%" }}>
                <option value="">Seleccionar...</option>
                {data.items.map(i => <option key={i.id} value={i.id}>{i.name} ({fmt(i.currentStock)} {i.unit})</option>)}
              </select>
            </Fld>
            <Fld label="Tipo">
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setMvType("entrada")} style={{ ...btnSmall, ...(mvType === "entrada" ? { background: "#16a34a14", color: "#16a34a", borderColor: "#16a34a" } : {}) }}>Entrada</button>
                <button onClick={() => setMvType("salida")} style={{ ...btnSmall, ...(mvType === "salida" ? { background: "#ca8a0414", color: "#ca8a04", borderColor: "#ca8a04" } : {}) }}>Salida</button>
              </div>
            </Fld>
            <Fld label="Cantidad">
              <input type="number" value={mvQty || ""} onChange={e => setMvQty(Number(e.target.value))} style={{ ...input, width: "100%" }} placeholder="Cantidad..." />
            </Fld>
            <Fld label="Notas">
              <input value={mvNotes} onChange={e => setMvNotes(e.target.value)} style={{ ...input, width: "100%" }} placeholder="Motivo o referencia..." />
            </Fld>
            <button onClick={recordMovement} disabled={saving || !mvItemId || mvQty <= 0} style={btnPrimary}>
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </Overlay>
      )}

      {/* ── Modal: Merma ── */}
      {showWaste && (
        <Overlay onClose={() => setShowWaste(false)}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Registrar merma</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Fld label="Artículo">
              <select value={wasteItemId} onChange={e => setWasteItemId(e.target.value)} style={{ ...input, width: "100%" }}>
                <option value="">Seleccionar...</option>
                {data.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Fld>
            <Fld label="Cantidad perdida">
              <input type="number" value={wasteQty || ""} onChange={e => setWasteQty(Number(e.target.value))} style={{ ...input, width: "100%" }} placeholder="Cantidad..." />
            </Fld>
            <Fld label="Razón">
              <select value={wasteReason} onChange={e => setWasteReason(e.target.value)} style={{ ...input, width: "100%" }}>
                <option value="">Seleccionar razón...</option>
                <option value="caducidad">Caducidad</option>
                <option value="rotura">Rotura / derrame</option>
                <option value="calidad">Calidad deficiente</option>
                <option value="sobreproduccion">Sobreproducción</option>
                <option value="otro">Otro</option>
              </select>
            </Fld>
            <button onClick={recordWaste} disabled={saving || !wasteItemId || wasteQty <= 0} style={{ ...btnPrimary, background: "#dc2626" }}>
              {saving ? "Guardando..." : "Registrar merma"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
