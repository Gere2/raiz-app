"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { signInWithGoogle, logout, consumeRedirectResult } from "../../lib/auth-client";
import { authedFetch } from "../../lib/authed-fetch";
import { useOrg } from "../hooks/useOrg";
import { fmt, fmt4 } from "../components/theme";
import { useBrand } from "../components/brand-context";

import {
  SideBtn,
  KpiCard,
  Modal,
  NewRecipeForm,
  NewCatalogForm,
  AddIngredientPanel,
  calcTotal,
  calcFoodCost,
  fcColor,
  fcBg,
  fcLabel,
  btnPrimary,
  btnSmall,
  btnIcon,
  inputStyle,
  tableWrap,
  thStyle,
  tdRight,
  kpiCardStyle,
  kpiLabelStyle,
  kpiValueStyle,
  fontFamily,
  mono,
} from "./components";
import type { CatalogItem, Ingredient, Recipe } from "./components";

// ─── Main Page ───────────────────────────────────────────────────
export default function EscandallPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { orgId, loadingOrgs } = useOrg(user);
  const brand = useBrand();

  // Data
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // UI state
  const [view, setView] = useState<"recipes" | "catalog" | "detail">("recipes");
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showNewCatalog, setShowNewCatalog] = useState(false);
  const [showAddIng, setShowAddIng] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editPrice, setEditPrice] = useState(false);
  const [priceVal, setPriceVal] = useState(0);
  const [saving, setSaving] = useState(false);

  // ─── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    consumeRedirectResult();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ─── Data Fetchers ───────────────────────────────────────────
  const fetchCatalog = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/catalog`);
      const data = await res.json();
      setCatalog(data.items || []);
    } catch (e) {
      console.error("fetchCatalog:", e);
    }
  }, [user, orgId]);

  const fetchRecipes = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/recipes`);
      const data = await res.json();
      setRecipes(data.recipes || []);
    } catch (e) {
      console.error("fetchRecipes:", e);
    }
  }, [user, orgId]);

  const fetchRecipeDetail = useCallback(
    async (recipeId: string) => {
      if (!user) return;
      try {
        const res = await authedFetch(user, `/api/org/${orgId}/recipes/${recipeId}`);
        const data = await res.json();
        if (data.recipe) {
          setSelectedRecipe(data.recipe);
          setIngredients(data.recipe.ingredients || []);
        }
      } catch (e) {
        console.error("fetchRecipeDetail:", e);
      }
    },
    [user, orgId]
  );

  useEffect(() => {
    if (user) {
      fetchCatalog();
      fetchRecipes();
    }
  }, [user, fetchCatalog, fetchRecipes]);

  // ─── Actions ─────────────────────────────────────────────────
  const openRecipe = async (r: Recipe) => {
    setView("detail");
    setShowAddIng(false);
    setEditPrice(false);
    await fetchRecipeDetail(r.id);
  };

  const goBack = () => {
    setView("recipes");
    setSelectedRecipe(null);
    setIngredients([]);
    fetchRecipes();
  };

  const createRecipe = async (name: string, yieldQty: number, yieldUnit: string, sellingPrice: number) => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, yieldQty, yieldUnit, sellingPrice }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowNewRecipe(false);
        await fetchRecipes();
        await openRecipe({ id: data.id, name, yieldQty, yieldUnit, sellingPrice, totalCost: 0, foodCostPct: 0 });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!user || !confirm("\u00bfBorrar esta receta?")) return;
    await authedFetch(user, `/api/org/${orgId}/recipes/${id}`, { method: "DELETE" });
    if (selectedRecipe?.id === id) goBack();
    else fetchRecipes();
  };

  const updatePrice = async (price: number) => {
    if (!user || !selectedRecipe) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellingPrice: price }),
      });
      setEditPrice(false);
      await fetchRecipeDetail(selectedRecipe.id);
    } finally {
      setSaving(false);
    }
  };

  const addIngredient = async (catalogItemId: string, qty: number, unit: string) => {
    if (!user || !selectedRecipe) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogItemId, qty, unit }),
      });
      setShowAddIng(false);
      await fetchRecipeDetail(selectedRecipe.id);
    } finally {
      setSaving(false);
    }
  };

  const updateIngQty = async (ingId: string, qty: number) => {
    if (!user || !selectedRecipe) return;
    await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}/ingredients/${ingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty }),
    });
    await fetchRecipeDetail(selectedRecipe.id);
  };

  const removeIngredient = async (ingId: string) => {
    if (!user || !selectedRecipe) return;
    await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}/ingredients/${ingId}`, { method: "DELETE" });
    await fetchRecipeDetail(selectedRecipe.id);
  };

  const createCatalogItem = async (item: { name: string; baseUnit: string; packQty: number; packUnit: string; packCost: number; supplier: string }) => {
    if (!user) return;
    setSaving(true);
    try {
      await authedFetch(user, `/api/org/${orgId}/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      setShowNewCatalog(false);
      await fetchCatalog();
    } finally {
      setSaving(false);
    }
  };

  // ─── Summary stats ──────────────────────────────────────────
  const avgFC = recipes.length > 0 ? recipes.reduce((s, r) => s + (r.foodCostPct || 0), 0) / recipes.length : 0;
  const avgMargin = recipes.length > 0 ? recipes.reduce((s, r) => s + (r.sellingPrice - (r.totalCost || 0)), 0) / recipes.length : 0;

  // ─── Loading / Login ────────────────────────────────────────
  if (loading) {
    return (
      <main style={{ padding: 32, fontFamily }}>
        <p style={{ color: "#888" }}>Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          padding: 32, fontFamily, minHeight: "100vh", background: "#0c0c0c",
          color: "#e8e8e8", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
        }}
      >
        <div style={{ fontSize: 32 }}>{brand.emoji}</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          {brand.chromeTitle}
        </h1>
        <button onClick={signInWithGoogle} style={btnPrimary}>
          Entrar con Google
        </button>
      </main>
    );
  }

  // ─── App Shell ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily, background: "#0c0c0c", color: "#e8e8e8", minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 210, borderRight: "1px solid #2a2a2a", padding: "24px 14px",
          display: "flex", flexDirection: "column", gap: 4, flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, paddingLeft: 8 }}>
          <span style={{ fontSize: 18 }}>\u2615</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Ra\u00edz y Grano</div>
            <div style={{ fontSize: 11, color: "#666" }}>Escandallos</div>
          </div>
        </div>

        <SideBtn label="Recetas" active={view === "recipes" || view === "detail"} onClick={() => (view === "detail" ? goBack() : setView("recipes"))} />
        <SideBtn label="Cat\u00e1logo" active={view === "catalog"} onClick={() => { setView("catalog"); fetchCatalog(); }} />

        <div style={{ flex: 1 }} />
        <div style={{ padding: "10px 8px", borderTop: "1px solid #2a2a2a", fontSize: 11, color: "#555" }}>
          <div>{user.email}</div>
          <button onClick={logout} style={{ marginTop: 8, background: "none", border: "1px solid #333", borderRadius: 6, color: "#888", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily }}>
            Salir
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", maxHeight: "100vh" }}>
        {/* ─── RECIPES LIST ─── */}
        {view === "recipes" && (
          <RecipesList
            recipes={recipes}
            avgFC={avgFC}
            avgMargin={avgMargin}
            onNewRecipe={() => setShowNewRecipe(true)}
            onOpenRecipe={openRecipe}
            onDeleteRecipe={deleteRecipe}
          />
        )}

        {/* ─── RECIPE DETAIL ─── */}
        {view === "detail" && selectedRecipe && (
          <RecipeDetail
            recipe={selectedRecipe}
            ingredients={ingredients}
            editPrice={editPrice}
            priceVal={priceVal}
            saving={saving}
            catalog={catalog}
            showAddIng={showAddIng}
            onGoBack={goBack}
            onEditPrice={() => { setPriceVal(selectedRecipe.sellingPrice); setEditPrice(true); }}
            onPriceChange={setPriceVal}
            onUpdatePrice={updatePrice}
            onToggleAddIng={() => { setShowAddIng(!showAddIng); if (!showAddIng) fetchCatalog(); }}
            onAddIngredient={addIngredient}
            onRemoveIngredient={removeIngredient}
            onCloseAddIng={() => setShowAddIng(false)}
          />
        )}

        {/* ─── CATALOG VIEW ─── */}
        {view === "catalog" && (
          <CatalogView
            catalog={catalog}
            catalogSearch={catalogSearch}
            onSearchChange={setCatalogSearch}
            onNewCatalog={() => setShowNewCatalog(true)}
          />
        )}
      </main>

      {/* ─── Modals ─── */}
      {showNewRecipe && (
        <Modal onClose={() => setShowNewRecipe(false)}>
          <NewRecipeForm onSave={createRecipe} saving={saving} />
        </Modal>
      )}
      {showNewCatalog && (
        <Modal onClose={() => setShowNewCatalog(false)}>
          <NewCatalogForm onSave={createCatalogItem} saving={saving} />
        </Modal>
      )}
    </div>
  );
}

// ─── Section: Recipes List ──────────────────────────────────────

function RecipesList({
  recipes, avgFC, avgMargin, onNewRecipe, onOpenRecipe, onDeleteRecipe,
}: {
  recipes: Recipe[];
  avgFC: number;
  avgMargin: number;
  onNewRecipe: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onDeleteRecipe: (id: string) => void;
}) {
  return (
    <div style={{ padding: "32px 36px", maxWidth: 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Escandallos</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>Coste por receta y m\u00e1rgenes</p>
        </div>
        <button onClick={onNewRecipe} style={btnPrimary}>+ Nueva receta</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Recetas" value={String(recipes.length)} />
        <KpiCard label="Food cost medio" value={`${fmt(avgFC)}%`} color={fcColor(avgFC)} />
        <KpiCard label="Margen medio" value={`${fmt(avgMargin)}\u20ac`} color="#16a34a" />
      </div>

      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
              {["Receta", "Coste", "PVP", "Margen", "Food cost", ""].map((h, i) => (
                <th key={i} style={{ ...thStyle, textAlign: i > 0 && i < 5 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => {
              const tc = r.totalCost || 0;
              const fc = r.foodCostPct || calcFoodCost(tc, r.sellingPrice);
              const margin = r.sellingPrice - tc;
              return (
                <tr key={r.id} onClick={() => onOpenRecipe(r)} style={{ borderBottom: "1px solid #222", cursor: "pointer" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{r.yieldQty} {r.yieldUnit}</div>
                  </td>
                  <td style={tdRight}>{fmt(tc)}\u20ac</td>
                  <td style={{ ...tdRight, fontWeight: 600 }}>{fmt(r.sellingPrice)}\u20ac</td>
                  <td style={{ ...tdRight, color: "#16a34a" }}>{fmt(margin)}\u20ac</td>
                  <td style={tdRight}>
                    <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6, color: fcColor(fc), background: fcBg(fc) }}>
                      {fmt(fc)}%
                    </span>
                  </td>
                  <td style={{ padding: "14px 8px", textAlign: "right" }}>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteRecipe(r.id); }} style={btnIcon} title="Borrar">\u2715</button>
                  </td>
                </tr>
              );
            })}
            {recipes.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#555" }}>Sin recetas. Crea tu primera.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Recipe Detail ─────────────────────────────────────

function RecipeDetail({
  recipe, ingredients, editPrice, priceVal, saving, catalog, showAddIng,
  onGoBack, onEditPrice, onPriceChange, onUpdatePrice, onToggleAddIng,
  onAddIngredient, onRemoveIngredient, onCloseAddIng,
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  editPrice: boolean;
  priceVal: number;
  saving: boolean;
  catalog: CatalogItem[];
  showAddIng: boolean;
  onGoBack: () => void;
  onEditPrice: () => void;
  onPriceChange: (v: number) => void;
  onUpdatePrice: (price: number) => void;
  onToggleAddIng: () => void;
  onAddIngredient: (catalogItemId: string, qty: number, unit: string) => void;
  onRemoveIngredient: (ingId: string) => void;
  onCloseAddIng: () => void;
}) {
  const total = calcTotal(ingredients);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onGoBack} style={{ ...btnIcon, fontSize: 18 }}>\u2190</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{recipe.name}</h1>
          <p style={{ color: "#666", fontSize: 12, margin: "2px 0 0" }}>Rendimiento: {recipe.yieldQty} {recipe.yieldUnit}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Coste total" value={`${fmt(recipe.totalCost || 0)}\u20ac`} />
        <div style={kpiCardStyle}>
          <div style={{ ...kpiLabelStyle, display: "flex", alignItems: "center", gap: 6 }}>
            PVP
            {!editPrice && (
              <button onClick={onEditPrice} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 0 }}>\u270e</button>
            )}
          </div>
          {editPrice ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
              <input type="number" step="0.1" value={priceVal} onChange={(e) => onPriceChange(Number(e.target.value))} style={{ ...inputStyle, width: 80, fontFamily: mono, fontSize: 16, fontWeight: 700 }} autoFocus onKeyDown={(e) => { if (e.key === "Enter") onUpdatePrice(priceVal); }} />
              <button onClick={() => onUpdatePrice(priceVal)} style={{ ...btnSmall, background: "#c8a97e", color: "#000" }} disabled={saving}>OK</button>
            </div>
          ) : (
            <div style={kpiValueStyle}>{fmt(recipe.sellingPrice)}\u20ac</div>
          )}
        </div>
        <KpiCard label="Margen" value={`${fmt(recipe.sellingPrice - (recipe.totalCost || 0))}\u20ac`} color={recipe.sellingPrice - (recipe.totalCost || 0) > 0 ? "#16a34a" : "#dc2626"} />
        <KpiCard label="Food cost" value={`${fmt(recipe.foodCostPct || 0)}%`} color={fcColor(recipe.foodCostPct || 0)} badge={fcLabel(recipe.foodCostPct || 0)} badgeBg={fcBg(recipe.foodCostPct || 0)} />
      </div>

      <div style={tableWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #2a2a2a" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Ingredientes</span>
          <button onClick={onToggleAddIng} style={btnSmall}>+ A\u00f1adir</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
              {["Ingrediente", "Cantidad", "\u20ac/ud", "Coste l\u00ednea", "% total", ""].map((h, i) => (
                <th key={i} style={{ ...thStyle, textAlign: i > 0 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing) => {
              const pct = total > 0 ? (ing.lineCost / total) * 100 : 0;
              return (
                <tr key={ing.id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13 }}>{ing.name}</td>
                  <td style={tdRight}><span style={{ fontFamily: mono, fontSize: 13 }}>{ing.qty} {ing.unit}</span></td>
                  <td style={{ ...tdRight, fontSize: 12, color: "#666" }}>{fmt4(ing.unitCost)}\u20ac</td>
                  <td style={{ ...tdRight, fontWeight: 600 }}>{fmt(ing.lineCost)}\u20ac</td>
                  <td style={{ ...tdRight, color: "#888", fontSize: 12 }}>{fmt(pct)}%</td>
                  <td style={{ padding: "12px 8px", textAlign: "right" }}>
                    <button onClick={() => onRemoveIngredient(ing.id)} style={btnIcon} title="Borrar">\u2715</button>
                  </td>
                </tr>
              );
            })}
            {ingredients.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#555" }}>Sin ingredientes. A\u00f1ade desde el cat\u00e1logo.</td></tr>
            )}
          </tbody>
          {ingredients.length > 0 && (
            <tfoot>
              <tr style={{ background: "#1a1a1a" }}>
                <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                <td colSpan={2} />
                <td style={{ ...tdRight, fontWeight: 700, color: "#c8a97e" }}>{fmt(total)}\u20ac</td>
                <td style={{ ...tdRight, fontWeight: 600, color: "#888" }}>100%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showAddIng && (
        <AddIngredientPanel catalog={catalog} onAdd={onAddIngredient} onClose={onCloseAddIng} saving={saving} />
      )}
    </div>
  );
}

// ─── Section: Catalog View ──────────────────────────────────────

function CatalogView({
  catalog, catalogSearch, onSearchChange, onNewCatalog,
}: {
  catalog: CatalogItem[];
  catalogSearch: string;
  onSearchChange: (v: string) => void;
  onNewCatalog: () => void;
}) {
  return (
    <div style={{ padding: "32px 36px", maxWidth: 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cat\u00e1logo de materias primas</h1>
          <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>{catalog.length} art\u00edculos</p>
        </div>
        <button onClick={onNewCatalog} style={btnPrimary}>+ Nuevo art\u00edculo</button>
      </div>

      <input
        placeholder="Buscar por nombre o proveedor..."
        value={catalogSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ ...inputStyle, width: "100%", maxWidth: 360, marginBottom: 20 }}
      />

      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
              {["Art\u00edculo", "Proveedor", "Pack", "\u20ac/pack", "Coste unitario"].map((h, i) => (
                <th key={i} style={{ ...thStyle, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog
              .filter((c) => c.name.toLowerCase().includes(catalogSearch.toLowerCase()) || c.supplier.toLowerCase().includes(catalogSearch.toLowerCase()))
              .map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>base: {c.baseUnit}</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 13 }}>{c.supplier}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#666" }}>{c.packQty} {c.baseUnit} ({c.packUnit})</td>
                  <td style={tdRight}>{fmt(c.packCost)}\u20ac</td>
                  <td style={tdRight}>
                    <span style={{ fontFamily: mono, fontSize: 12, color: "#c8a97e", fontWeight: 600 }}>
                      {fmt4(c.unitCost)}\u20ac/{c.baseUnit}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
