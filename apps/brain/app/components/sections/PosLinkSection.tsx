"use client";

import { useState, useEffect, useCallback } from "react";
import { Kpi, Overlay, Fld } from "../ui";
import {
  T, page, pageTitle, pageSub, tableWrap, tableHead,
  tbl, trHead, trBody, th, td, tdR, badge, btnSmall, btnPrimary, input, fmt,
} from "../theme";
import type { User } from "firebase/auth";

/* ─── Types ── */
type PosProduct = { id: string; name: string; price: number; categoryName: string };
type Recipe = {
  id: string; name: string; sellingPrice: number; totalCost: number;
  foodCostPct: number; productId?: string; productName?: string;
};
type LinkStatus = {
  product: PosProduct;
  recipe: Recipe | null;
  status: "linked" | "unlinked" | "price_mismatch";
  priceDelta?: number;
};

interface PosLinkProps {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
  onOpenRecipe: (recipeId: string) => void;
}

export default function PosLinkSection({ user, orgId, authedFetch, onOpenRecipe }: PosLinkProps) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked" | "mismatch">("all");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ updated: number; created: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<PosProduct | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        authedFetch(user, `/api/pos/products?orgId=${orgId}`),
        authedFetch(user, `/api/org/${orgId}/recipes`),
      ]);
      const pData = await pRes.json();
      const rData = await rRes.json();
      setProducts(pData.products || []);
      setRecipes(rData.recipes || []);
    } catch (e) { console.error("PosLink fetch:", e); }
    finally { setLoading(false); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const recipeByProduct: Record<string, Recipe> = {};
  recipes.forEach(r => { if (r.productId) recipeByProduct[r.productId] = r; });

  const linkStatuses: LinkStatus[] = products.map(p => {
    const r = recipeByProduct[p.id];
    if (!r) return { product: p, recipe: null, status: "unlinked" as const };
    const delta = Math.abs(p.price - r.sellingPrice);
    if (delta > 0.01) return { product: p, recipe: r, status: "price_mismatch" as const, priceDelta: delta };
    return { product: p, recipe: r, status: "linked" as const };
  });

  const filtered = linkStatuses.filter(ls => {
    if (filter === "all") return true;
    if (filter === "mismatch") return ls.status === "price_mismatch";
    return ls.status === filter;
  });

  const linkedCount = linkStatuses.filter(ls => ls.status === "linked").length;
  const unlinkedCount = linkStatuses.filter(ls => ls.status === "unlinked").length;
  const mismatchCount = linkStatuses.filter(ls => ls.status === "price_mismatch").length;
  const coverage = products.length > 0 ? ((linkedCount + mismatchCount) / products.length * 100) : 0;

  const linkProduct = async (productId: string, recipeId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/recipes/${recipeId}/link-product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, productName: product.name, productPrice: product.price }),
      });
      setShowLinkModal(null); setSelectedRecipeId("");
      await fetchAll();
    } finally { setSaving(false); }
  };

  const createAndLink = async (product: PosProduct) => {
    setSaving(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/recipes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: product.name, yieldQty: 1, yieldUnit: "unidad", sellingPrice: product.price }),
      });
      const d = await r.json();
      if (d.ok) {
        await authedFetch(user, `/api/org/${orgId}/recipes/${d.id}/link-product`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id, productName: product.name, productPrice: product.price }),
        });
        await fetchAll();
      }
    } finally { setSaving(false); setShowLinkModal(null); }
  };

  const syncPrices = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/sync-pos`, { method: "POST" });
      const d = await r.json();
      if (d.ok) { setSyncResult({ updated: d.changes?.length || 0, created: 0 }); await fetchAll(); }
    } finally { setSyncing(false); }
  };

  const batchCreateRecipes = async () => {
    const unlinked = linkStatuses.filter(ls => ls.status === "unlinked");
    if (!confirm(`¿Crear ${unlinked.length} escandallos automáticamente para los productos sin vincular?`)) return;
    setSaving(true);
    try {
      for (const ls of unlinked) {
        const r = await authedFetch(user, `/api/org/${orgId}/recipes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: ls.product.name, yieldQty: 1, yieldUnit: "unidad", sellingPrice: ls.product.price }),
        });
        const d = await r.json();
        if (d.ok) {
          await authedFetch(user, `/api/org/${orgId}/recipes/${d.id}/link-product`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: ls.product.id, productName: ls.product.name, productPrice: ls.product.price }),
          });
        }
      }
      await fetchAll();
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ ...page, textAlign: "center", paddingTop: 80, color: T.dim }}>Cargando datos POS y recetas...</div>;

  const statusColor = (s: string) => s === "linked" ? "#16a34a" : s === "price_mismatch" ? "#ca8a04" : "#dc2626";
  const statusBg = (s: string) => s === "linked" ? "#f0fdf4" : s === "price_mismatch" ? "#fefce8" : "#fef2f2";
  const statusLabel = (s: string) => s === "linked" ? "Vinculado" : s === "price_mismatch" ? "Precio diff" : "Sin vincular";

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={pageTitle}>Conexión Recetas ↔ POS</h1>
          <p style={pageSub}>Vincula productos del POS con sus escandallos para calcular costes reales</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={syncPrices} disabled={syncing} style={{ ...btnSmall, color: T.accent, borderColor: T.accent + "40" }}>
            {syncing ? "Sincronizando..." : "↻ Sync precios"}
          </button>
          {unlinkedCount > 0 && (
            <button onClick={batchCreateRecipes} disabled={saving} style={btnPrimary}>
              {saving ? "Creando..." : `Crear ${unlinkedCount} escandallos`}
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div style={{ background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", padding: "10px 16px", marginBottom: 16, fontSize: 12 }}>
          ✓ {syncResult.updated} precio(s) actualizado(s)
          <button onClick={() => setSyncResult(null)} style={{ ...btnSmall, marginLeft: 12, fontSize: 10 }}>✕</button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label="Productos POS" value={String(products.length)} />
        <Kpi label="Vinculados" value={String(linkedCount)} color="#16a34a" />
        <Kpi label="Sin vincular" value={String(unlinkedCount)} color={unlinkedCount > 0 ? "#dc2626" : "#16a34a"} />
        <Kpi label="Precio diferente" value={String(mismatchCount)} color={mismatchCount > 0 ? "#ca8a04" : T.dim} />
        <Kpi label="Cobertura" value={`${fmt(coverage)}%`} color={coverage >= 80 ? "#16a34a" : "#ca8a04"} />
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([
          { key: "all", label: "Todos", count: products.length },
          { key: "linked", label: "Vinculados", count: linkedCount },
          { key: "unlinked", label: "Sin vincular", count: unlinkedCount },
          { key: "mismatch", label: "Precio diff", count: mismatchCount },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            ...btnSmall,
            ...(filter === f.key ? { background: T.accent + "14", color: T.accent, borderColor: T.accent } : {}),
          }}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={tableWrap}>
        <table style={tbl}>
          <thead><tr style={trHead}>
            {["Producto POS", "Categoría", "PVP POS", "Receta", "Coste receta", "FC%", "Estado", ""].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filtered.map(ls => (
              <tr key={ls.product.id} style={trBody}>
                <td style={td}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{ls.product.name}</div>
                </td>
                <td style={{ ...td, color: T.muted, fontSize: 12 }}>{ls.product.categoryName || "—"}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmt(ls.product.price)}€</td>
                <td style={td}>
                  {ls.recipe ? (
                    <button onClick={() => onOpenRecipe(ls.recipe!.id)} style={{ ...btnSmall, fontSize: 12 }}>
                      {ls.recipe.name} →
                    </button>
                  ) : (
                    <span style={{ color: T.dim, fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={tdR}>{ls.recipe ? `${fmt(ls.recipe.totalCost)}€` : <span style={{ color: T.dim }}>—</span>}</td>
                <td style={tdR}>
                  {ls.recipe ? (
                    <span style={{ ...badge, color: ls.recipe.foodCostPct <= 25 ? "#16a34a" : ls.recipe.foodCostPct <= 35 ? "#ca8a04" : "#dc2626", background: ls.recipe.foodCostPct <= 25 ? "#f0fdf4" : ls.recipe.foodCostPct <= 35 ? "#fefce8" : "#fef2f2" }}>
                      {fmt(ls.recipe.foodCostPct)}%
                    </span>
                  ) : <span style={{ color: T.dim }}>—</span>}
                </td>
                <td style={tdR}>
                  <span style={{ ...badge, color: statusColor(ls.status), background: statusBg(ls.status) }}>
                    {statusLabel(ls.status)}
                  </span>
                  {ls.priceDelta !== undefined && ls.priceDelta > 0 && (
                    <div style={{ fontSize: 10, color: "#ca8a04", marginTop: 2 }}>Δ {fmt(ls.priceDelta)}€</div>
                  )}
                </td>
                <td style={{ padding: "12px 8px", textAlign: "right" }}>
                  {ls.status === "unlinked" && (
                    <button onClick={() => setShowLinkModal(ls.product)} style={{ ...btnSmall, color: T.accent, borderColor: T.accent + "40" }}>Vincular</button>
                  )}
                  {ls.status === "price_mismatch" && (
                    <button onClick={syncPrices} disabled={syncing} style={{ ...btnSmall, color: "#ca8a04", borderColor: "#ca8a0440" }}>Sync</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.dim }}>Sin productos en este filtro.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Link modal ── */}
      {showLinkModal && (
        <Overlay onClose={() => { setShowLinkModal(null); setSelectedRecipeId(""); }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Vincular: {showLinkModal.name}</h3>
          <p style={{ fontSize: 12, color: T.muted, margin: "0 0 20px" }}>PVP: {fmt(showLinkModal.price)}€ · {showLinkModal.categoryName}</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Fld label="Vincular a receta existente">
              <select value={selectedRecipeId} onChange={e => setSelectedRecipeId(e.target.value)} style={{ ...input, width: "100%" }}>
                <option value="">Seleccionar receta...</option>
                {recipes.filter(r => !r.productId).map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({fmt(r.totalCost)}€ · FC: {fmt(r.foodCostPct)}%)</option>
                ))}
              </select>
            </Fld>

            {selectedRecipeId && (
              <button onClick={() => linkProduct(showLinkModal.id, selectedRecipeId)} disabled={saving} style={btnPrimary}>
                {saving ? "Vinculando..." : "Vincular"}
              </button>
            )}

            <div style={{ textAlign: "center", fontSize: 12, color: T.dim, padding: "8px 0" }}>— o —</div>

            <button onClick={() => createAndLink(showLinkModal)} disabled={saving} style={{ ...btnPrimary, background: "#16a34a" }}>
              {saving ? "Creando..." : `Crear nuevo escandallo "${showLinkModal.name}"`}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
