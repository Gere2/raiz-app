"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { signInWithGoogle, logout, consumeRedirectResult } from "../lib/auth-client";
import { authedFetch } from "../lib/authed-fetch";
import type { Product, Category, InvItem, CatalogItem, Ingredient, Recipe, Sku, Packaging, Supplier, DashboardData } from "../lib/types";
import { T, page, pageTitle, pageSub, modalTitle, tableWrap, tableHead, tableRow, tbl, trHead, trBody, th, td, tdR, badge, kpiBox, kpiLbl, kpiVal, input, btnPrimary, btnSmall, btnGhost, fmt, fmt4, stationEmoji } from "./components/theme";
import { Shell, NavBtn, NavGroup, Kpi, ActionCard, FilterTab, Overlay, Fld, EditableList, ErrorBanner } from "./components/ui";
import { useOrg } from "./hooks/useOrg";
import { useOrgConfig } from "./hooks/useOrgConfig";
import { useBrand } from "./components/brand-context";

/* ── Section components (lazy-loaded for code splitting) ── */
const InvoiceSection = dynamic(() => import("./components/invoice-section"), { ssr: false });
const HomeSection = dynamic(() => import("./components/sections/HomeSection"), { ssr: false });
const OrgConfigSection = dynamic(() => import("./components/sections/OrgConfigSection"), { ssr: false });
const CustomersSection = dynamic(() => import("./components/sections/CustomersSection"), { ssr: false });
const RewardsSection = dynamic(() => import("./components/sections/RewardsSection"), { ssr: false });
const EventsSection = dynamic(() => import("./components/sections/EventsSection"), { ssr: false });
const QuizzesSection = dynamic(() => import("./components/sections/QuizzesSection"), { ssr: false });
const MissionsSection = dynamic(() => import("./components/sections/MissionsSection"), { ssr: false });
const MarginsSection = dynamic(() => import("./components/sections/MarginsSection"), { ssr: false });
const InventorySection = dynamic(() => import("./components/sections/InventorySection"), { ssr: false });
const SeasonalRecipesSection = dynamic(() => import("./components/sections/SeasonalRecipesSection"), { ssr: false });
const PosLinkSection = dynamic(() => import("./components/sections/PosLinkSection"), { ssr: false });
const TreasurySection = dynamic(() => import("./components/sections/TreasurySection"), { ssr: false });
const StagingSection = dynamic(() => import("./components/sections/StagingSection"), { ssr: false });
const MeetingCombosSection = dynamic(() => import("./components/sections/MeetingCombosSection"), { ssr: false });
const ReportsSection = dynamic(() => import("./components/sections/ReportsSection"), { ssr: false });
const VouchersSection = dynamic(() => import("./components/sections/VouchersSection"), { ssr: false });
const ContactsSection = dynamic(() => import("./components/sections/ContactsSection"), { ssr: false });

/* ── Form components (lazy-loaded) ── */
const NewRecipeForm = dynamic(() => import("./components/forms/NewRecipeForm"), { ssr: false });
const NewCatalogForm = dynamic(() => import("./components/forms/NewCatalogForm"), { ssr: false });
const NewSkuForm = dynamic(() => import("./components/forms/NewSkuForm"), { ssr: false });
const NewPackagingForm = dynamic(() => import("./components/forms/NewPackagingForm"), { ssr: false });
const NewSupplierForm = dynamic(() => import("./components/forms/NewSupplierForm"), { ssr: false });
const AddIngPanel = dynamic(() => import("./components/forms/AddIngPanel"), { ssr: false });

/* ─── Helpers ───────────────────────────────────────────────── */
const calcTotal = (i: Ingredient[]) => i.reduce((s, x) => s + (x.lineCost || 0), 0);

type Section = "home" | "products" | "recipes" | "detail" | "catalog" | "inventory" | "invoices" | "staging" | "skus" | "skuDetail" | "packaging" | "suppliers" | "supplierDetail" | "config" | "customers" | "rewards" | "events" | "quizzes" | "missions" | "margins" | "inventoryBrain" | "seasonal" | "posLink" | "treasury" | "combos" | "reports" | "vouchers" | "contacts";

/**
 * Secciones marcadas como experimentales / no usadas semanalmente.
 * Se ocultan del menú por defecto y solo aparecen al pulsar
 * "Mostrar avanzado". Ajusta esta lista según tu uso real.
 *
 * Ver PLAN.md para criterio de clasificación.
 */
const EXPERIMENTAL_SECTIONS = new Set<Section>([
  "inventoryBrain",
  "combos",
  "customers",
  "rewards",
  "events",
  "quizzes",
  "missions",
  "reports",
  "margins", // dashboard por-ventas vacío: tickets/orders no llevan orgId y
             // falta el índice (orgId+createdAt). La demo de márgenes va por
             // "Escandallos", que sí tiene coste/food-cost por receta.
  "staging", // depende de servicio Python externo (singularidad-engine);
             // su lógica de matching factura↔mov se migrará a lib/treasury/
             // invoice-matcher.ts. Ver PLAN.md sección "Backlog técnico".
]);

/**
 * Deep-linking por ?section= (Fase 2.2b). Validado por marca: un café Enverde
 * solo puede abrir secciones de rentabilidad; cualquier otra (incluso forzada
 * por URL) cae a "home". Para Enverde la entrada guiada de Caja sigue siendo
 * /org/[orgId]/treasury/start; `treasury` (sección completa: movimientos,
 * escenarios, vistas mensual/trimestral) se expone además como "Caja avanzada".
 * `margins` se habilita en Fase 2.3 (Márgenes por escandallo; empty state
 * honesto si aún no hay ventas/costes). Profundidad de costes (piloto):
 * `catalog` + `suppliers` + `invoices` + `inventoryBrain` para que los
 * escandallos pasen de costes aproximados a costes reales.
 */
const ENVERDE_ALLOWED_SECTIONS = new Set<string>([
  "home", "products", "recipes", "margins", "config",
  "catalog", "suppliers", "invoices", "vouchers",
  "treasury", "inventoryBrain", "seasonal", "skus", "contacts",
]);

/**
 * Raíz: todas las secciones navegables actuales (se excluyen las sub-vistas que
 * requieren selección previa — detail/skuDetail/supplierDetail/packaging — para
 * no aterrizar en una vista de detalle vacía).
 */
const ALL_KNOWN_SECTIONS = new Set<string>([
  "home", "products", "recipes", "catalog", "inventory", "invoices", "staging",
  "skus", "suppliers", "config", "customers", "rewards", "events", "quizzes",
  "missions", "margins", "inventoryBrain", "seasonal", "posLink", "treasury",
  "combos", "reports",
]);

/** Resuelve ?section= a una sección permitida para la marca, o "home". */
function resolveSectionForBrand(raw: string | null, brandKey: string): Section {
  if (!raw) return "home";
  if (brandKey === "enverde") {
    return ENVERDE_ALLOWED_SECTIONS.has(raw) ? (raw as Section) : "home";
  }
  return ALL_KNOWN_SECTIONS.has(raw) ? (raw as Section) : "home";
}

/* ═══════════════════════════════════════════════════════════════ */
export default function BrainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { orgs, orgId, setOrgId, loadingOrgs } = useOrg(user);
  const { config: orgConfig, loading: configLoading, updateConfig, fcColor, fcBg, fcLabel } = useOrgConfig(user, orgId);
  const brand = useBrand();
  const isEnverde = brand.key === "enverde";

  /* ── Data state ── */
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [selectedSku, setSelectedSku] = useState<Sku | null>(null);
  const [packagings, setPackagings] = useState<Packaging[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierInvoices, setSupplierInvoices] = useState<Array<Record<string, unknown>>>([]);

  /* ── Dashboard / profitability data ── */
  type DashboardData = {
    kpis: { totalRevenue: number; totalTransactions: number; avgTicket: number; avgFoodCostPct: number; estimatedProfit: number; costCoverage: number; days: number };
    profitability: Array<{ productId: string; productName: string; unitsSold: number; revenue: number; unitCost: number; unitMargin: number; foodCostPct: number; totalProfit: number; hasCostData: boolean }>;
    alerts: Array<{ type: string; message: string; productId?: string }>;
  };
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  /* ── Error states for UX-21 ── */
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ── UI state ── */
  const [section, setSection] = useState<Section>("home");
  // Toggle para esconder secciones experimentales / no usadas semanalmente.
  // Por defecto ocultas — el menú "respira". Se activan con el botón al final.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modal, setModal] = useState<null | "newRecipe" | "newCatalog" | "linkProduct" | "newSku" | "newPackaging" | "newSupplier">(null);
  const [showAddIng, setShowAddIng] = useState(false);
  const [editPrice, setEditPrice] = useState(false);
  const [priceVal, setPriceVal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [prodFilter, setProdFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ changes: Array<{ name: string; oldPrice: number; newPrice: number }> } | null>(null);
  const [sideOpen, setSideOpen] = useState(true);

  /* ── Auth ── */
  useEffect(() => { consumeRedirectResult(); return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }); }, []);

  /* ── Fetchers (depend on user + orgId) ── */
  const fetchProducts = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/pos/products?orgId=${orgId}`); const d = await r.json(); setProducts(d.products || []); setCategories(d.categories || []); setErrors(e => ({ ...e, products: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, products: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchInventory = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/pos/inventory?orgId=${orgId}`); const d = await r.json(); setInventory(d.items || []); setErrors(e => ({ ...e, inventory: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, inventory: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchCatalog = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/catalog`); const d = await r.json(); setCatalog(d.items || []); setErrors(e => ({ ...e, catalog: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, catalog: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchRecipes = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/recipes`); const d = await r.json(); setRecipes(d.recipes || []); setErrors(e => ({ ...e, recipes: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, recipes: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchDetail = useCallback(async (id: string) => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/recipes/${id}`); const d = await r.json(); if (d.recipe) { setSelectedRecipe(d.recipe); setIngredients(d.recipe.ingredients || []); } setErrors(e => ({ ...e, detail: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, detail: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchSkus = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/skus`); const d = await r.json(); setSkus(d.skus || []); setErrors(e => ({ ...e, skus: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, skus: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchPackagings = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/packaging`); const d = await r.json(); setPackagings(d.items || []); setErrors(e => ({ ...e, packagings: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, packagings: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchSuppliers = useCallback(async () => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/suppliers`); const d = await r.json(); setSuppliers(d.suppliers || []); setErrors(e => ({ ...e, suppliers: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, suppliers: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);
  const fetchSupplierDetail = useCallback(async (id: string) => { if (!user || !orgId) return; try { const r = await authedFetch(user, `/api/org/${orgId}/suppliers/${id}`); const d = await r.json(); if (d.supplier) setSelectedSupplier(d.supplier); setSupplierInvoices(d.invoices || []); setErrors(e => ({ ...e, supplierDetail: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, supplierDetail: "Error cargando datos. Pulsa para reintentar." })); } }, [user, orgId]);

  /* ── Dashboard fetcher ── */
  const fetchDashboard = useCallback(async () => {
    if (!user || !orgId) return;
    setDashLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/dashboard?days=30`);
      if (r.ok) { const d = await r.json(); setDashboard(d); setErrors(e => ({ ...e, dashboard: "" })); }
    } catch (e) { console.error("Dashboard fetch error:", e); setErrors(ex => ({ ...ex, dashboard: "Error cargando datos. Pulsa para reintentar." })); }
    finally { setDashLoading(false); }
  }, [user, orgId]);

  /* Refetch all data when org changes */
  useEffect(() => { if (user && orgId) { fetchProducts(); fetchRecipes(); fetchCatalog(); fetchSkus(); fetchDashboard(); } }, [user, orgId, fetchProducts, fetchRecipes, fetchCatalog, fetchSkus, fetchDashboard]);

  /* Deep-linking validado por marca (Fase 2.2b): ?section=... → sección permitida
   * o "home". Se lee tras montar (cliente) para no romper SSR/hidratación. Los
   * datos ya los carga el effect de arriba cuando orgId resuelve. */
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("section");
    setSection(resolveSectionForBrand(raw, brand.key));
  }, [brand.key]);

  /* ── Maps ── */
  const recipeByProduct: Record<string, Recipe> = {};
  recipes.forEach(r => { if (r.productId) recipeByProduct[r.productId] = r; });
  const recipeMap: Record<string, Recipe> = {};
  recipes.forEach(r => { recipeMap[r.id] = r; });
  const packMap: Record<string, Packaging> = {};
  packagings.forEach(p => { packMap[p.id] = p; });

  /* ── Recipe actions ── */
  const openRecipe = async (r: Recipe) => { setSection("detail"); setShowAddIng(false); setEditPrice(false); await fetchDetail(r.id); };
  const goBack = () => { setSection("recipes"); setSelectedRecipe(null); setIngredients([]); fetchRecipes(); };

  const createRecipe = async (name: string, yieldQty: number, yieldUnit: string, sellingPrice: number) => {
    if (!user) return; setSaving(true);
    try { const r = await authedFetch(user, `/api/org/${orgId}/recipes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, yieldQty, yieldUnit, sellingPrice }) }); const d = await r.json(); if (d.ok) { setModal(null); await fetchRecipes(); openRecipe({ id: d.id, name, yieldQty, yieldUnit, sellingPrice, totalCost: 0, foodCostPct: 0 }); } } finally { setSaving(false); }
  };

  const createRecipeForProduct = async (product: Product) => {
    if (!user) return; setSaving(true);
    try { const r = await authedFetch(user, `/api/org/${orgId}/recipes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: product.name, yieldQty: 1, yieldUnit: "unidad", sellingPrice: product.price }) }); const d = await r.json(); if (!d.ok) return; await authedFetch(user, `/api/org/${orgId}/recipes/${d.id}/link-product`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, productName: product.name, productPrice: product.price }) }); await fetchRecipes(); openRecipe({ id: d.id, name: product.name, yieldQty: 1, yieldUnit: "unidad", sellingPrice: product.price, totalCost: 0, foodCostPct: 0, productId: product.id }); } finally { setSaving(false); }
  };

  const linkProduct = async (recipeId: string, product: Product) => {
    if (!user) return; setSaving(true);
    try { await authedFetch(user, `/api/org/${orgId}/recipes/${recipeId}/link-product`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, productName: product.name, productPrice: product.price }) }); await fetchDetail(recipeId); await fetchRecipes(); } finally { setSaving(false); setModal(null); }
  };

  const deleteRecipe = async (id: string, name?: string) => {
    const recipe = recipes.find(r => r.id === id);
    const linkedProduct = recipe?.productId ? products.find(p => p.id === recipe.productId) : null;
    const warning = linkedProduct
      ? `¿Borrar "${name || 'esta receta'}"?\n\n⚠️ Esta receta está vinculada al producto "${linkedProduct.name}". Al borrarla, el producto perderá su información de costes.\n\nEsta acción no se puede deshacer.`
      : `¿Borrar "${name || 'esta receta'}"? Esta acción no se puede deshacer.`;
    if (!user || !confirm(warning)) return;
    await authedFetch(user, `/api/org/${orgId}/recipes/${id}`, { method: "DELETE" });
    if (selectedRecipe?.id === id) goBack(); else fetchRecipes();
  };

  const updatePrice = async (price: number) => { if (!user || !selectedRecipe) return; setSaving(true); try { await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellingPrice: price }) }); setEditPrice(false); await fetchDetail(selectedRecipe.id); } finally { setSaving(false); } };

  const addIngredient = async (catalogItemId: string, qty: number, unit: string) => { if (!user || !selectedRecipe) return; setSaving(true); try { await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}/ingredients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogItemId, qty, unit }) }); setShowAddIng(false); await fetchDetail(selectedRecipe.id); } finally { setSaving(false); } };

  const removeIngredient = async (ingId: string) => { if (!user || !selectedRecipe) return; await authedFetch(user, `/api/org/${orgId}/recipes/${selectedRecipe.id}/ingredients/${ingId}`, { method: "DELETE" }); await fetchDetail(selectedRecipe.id); };

  const createCatalogItem = async (item: { name: string; baseUnit: string; packQty: number; packUnit: string; packCost: number; supplier: string }) => { if (!user) return; setSaving(true); try { await authedFetch(user, `/api/org/${orgId}/catalog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) }); setModal(null); await fetchCatalog(); } finally { setSaving(false); } };

  const deleteCatalogItem = async (id: string, name?: string) => { if (!user || !confirm(`¿Borrar "${name || 'este artículo'}"? Esta acción no se puede deshacer.`)) return; await authedFetch(user, `/api/org/${orgId}/catalog/${id}`, { method: "DELETE" }); await fetchCatalog(); };

  const updateCatalogItem = async (id: string, updates: Record<string, unknown>) => { if (!user) return; setSaving(true); try { await authedFetch(user, `/api/org/${orgId}/catalog/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); await fetchCatalog(); } finally { setSaving(false); } };

  /* ── SKU actions ── */
  const createSku = async (data: Record<string, unknown>) => {
    if (!user) return; setSaving(true);
    try { const r = await authedFetch(user, `/api/org/${orgId}/skus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const d = await r.json(); if (d.ok) { setModal(null); fetchSkus(); } } finally { setSaving(false); }
  };

  const openSku = async (s: Sku) => {
    setSection("skuDetail"); setSelectedSku(s);
    if (!user) return;
    try { const r = await authedFetch(user, `/api/org/${orgId}/skus/${s.id}`); const d = await r.json(); if (d.sku) setSelectedSku(d.sku); setErrors(e => ({ ...e, skuDetail: "" })); } catch (e) { console.error(e); setErrors(ex => ({ ...ex, skuDetail: "Error cargando datos. Pulsa para reintentar." })); }
  };

  const deleteSku = async (id: string, name?: string) => { if (!user || !confirm(`¿Borrar "${name || 'este SKU'}"? Esta acción no se puede deshacer.`)) return; await authedFetch(user, `/api/org/${orgId}/skus/${id}`, { method: "DELETE" }); setSection("skus"); fetchSkus(); };

  const updateSku = async (id: string, updates: Record<string, unknown>) => {
    if (!user) return; setSaving(true);
    try { await authedFetch(user, `/api/org/${orgId}/skus/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const r = await authedFetch(user, `/api/org/${orgId}/skus/${id}`); const d = await r.json(); if (d.sku) setSelectedSku(d.sku); fetchSkus(); } finally { setSaving(false); }
  };

  /* ── Packaging actions ── */
  const createPackaging = async (data: { name: string; items: Array<{ name: string; unitCost: number; qty: number }> }) => {
    if (!user) return; setSaving(true);
    try { await authedFetch(user, `/api/org/${orgId}/packaging`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); setModal(null); fetchPackagings(); } finally { setSaving(false); }
  };

  const deletePackaging = async (id: string, name?: string) => { if (!user || !confirm(`¿Borrar "${name || 'este packaging'}"? Esta acción no se puede deshacer.`)) return; await authedFetch(user, `/api/org/${orgId}/packaging/${id}`, { method: "DELETE" }); fetchPackagings(); };

  /* ── Supplier actions ── */
  const createSupplier = async (data: { name: string; contact: string; phone: string; email: string; notes: string }) => {
    if (!user) return; setSaving(true);
    try { await authedFetch(user, `/api/org/${orgId}/suppliers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); setModal(null); fetchSuppliers(); } finally { setSaving(false); }
  };

  const openSupplier = async (s: Supplier) => { setSection("supplierDetail"); await fetchSupplierDetail(s.id); };
  const deleteSupplier = async (id: string, name?: string) => { if (!user || !confirm(`¿Borrar "${name || 'este proveedor'}"? Esta acción no se puede deshacer.`)) return; await authedFetch(user, `/api/org/${orgId}/suppliers/${id}`, { method: "DELETE" }); setSection("suppliers"); fetchSuppliers(); };

  /* ── POS Sync ── */
  const syncPos = async () => {
    if (!user) return; setSyncing(true); setSyncResult(null);
    try { const r = await authedFetch(user, `/api/org/${orgId}/sync-pos`, { method: "POST" }); const d = await r.json(); if (d.ok) { setSyncResult(d); fetchRecipes(); fetchSkus(); } } finally { setSyncing(false); }
  };

  /* ── Stats ── */
  const linkedRecipes = recipes.filter(r => r.productId);
  const unlinkedProducts = products.filter(p => !recipeByProduct[p.id]);
  const avgFC = linkedRecipes.length > 0 ? linkedRecipes.reduce((s, r) => s + (r.foodCostPct || 0), 0) / linkedRecipes.length : 0;
  const avgMargin = linkedRecipes.length > 0 ? linkedRecipes.reduce((s, r) => s + (r.sellingPrice - (r.totalCost || 0)), 0) / linkedRecipes.length : 0;
  const coveragePct = products.length > 0 ? (linkedRecipes.length / products.length) * 100 : 0;

  /* ── Loading / Login ── */
  if (loading || loadingOrgs) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: T.dim, fontSize: 14 }}>{brand.loadingLabel}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
  if (!user) return (
    <div style={{ minHeight: "100vh", background: T.sidebarBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
      <div style={{ textAlign: "center", maxWidth: 360, padding: 40 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg, #3F6B2E, #4F8537)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 8px 32px rgba(63, 107, 46, 0.3)" }}>
          <span style={{ fontSize: 32, filter: "grayscale(0)" }}>{brand.emoji}</span>
        </div>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.03em" }}>{brand.name}</h1>
        <p style={{ color: T.sidebarDim, fontSize: 14, margin: "0 0 32px", lineHeight: 1.5 }}>{brand.loginSub}</p>
        <button onClick={signInWithGoogle} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "14px 24px", fontSize: 15, borderRadius: 12, background: "linear-gradient(135deg, #3F6B2E, #2F5222)" }}>Entrar con Google</button>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════ */
  return (
    <Shell>
      {/* ── Sidebar ── */}
      <nav style={{ width: sideOpen ? 240 : 64, background: T.sidebarBg, padding: sideOpen ? "16px 10px" : "16px 8px", display: "flex", flexDirection: "column", gap: 1, flexShrink: 0, transition: "width 0.2s ease", overflow: "hidden", overflowY: "auto" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: sideOpen ? "8px 14px 12px" : "8px 6px 12px", cursor: "pointer", marginBottom: 4 }} onClick={() => setSideOpen(!sideOpen)}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #3F6B2E, #4F8537)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>{brand.emoji}</span>
          </div>
          {sideOpen && <div><div style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: "-0.02em" }}>{brand.sidebarTitle}</div></div>}
        </div>

        {/* Org switcher */}
        {sideOpen && orgs.length > 1 && (
          <select value={orgId} onChange={e => setOrgId(e.target.value)} style={{ width: "calc(100% - 16px)", margin: "0 8px 12px", padding: "8px 10px", fontSize: 12, border: `1px solid ${T.sidebarBorder}`, borderRadius: 8, background: T.sidebarHover, color: T.sidebarText, cursor: "pointer" }}>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>
        )}
        {sideOpen && orgs.length <= 1 && orgId && (
          <div style={{ fontSize: 11, color: T.sidebarAccent, padding: "2px 14px", marginBottom: 8, fontWeight: 600 }}>{orgs[0]?.name || orgId}</div>
        )}

        {/* ═══ NAV ENVERDE — mínima, orientada a rentabilidad (2.2a) ═══ */}
        {isEnverde && (
          <>
            <NavGroup label="Tu rentabilidad" open={sideOpen} />
            <NavBtn label="Inicio" icon="◉" active={false} onClick={() => { window.location.href = orgId ? `/org/${orgId}` : "/"; }} open={sideOpen} />
            <NavBtn label="Caja y sueldo" icon="◈" active={false} onClick={() => { window.location.href = orgId ? `/org/${orgId}/treasury/start` : "/"; }} open={sideOpen} />
            {/* Tesorería completa (movimientos, escenarios, mensual/trimestral) — la guiada sigue siendo la entrada principal */}
            <NavBtn label="Caja avanzada" icon="◇" active={section === "treasury"} onClick={() => setSection("treasury")} open={sideOpen} />
            <NavBtn label="Productos" icon="▨" active={section === "products"} onClick={() => { setSection("products"); fetchProducts(); }} badge={String(products.length)} open={sideOpen} />
            <NavBtn label="Escandallos" icon="▤" active={section === "recipes" || section === "detail"} onClick={() => { if (section === "detail") goBack(); else setSection("recipes"); }} badge={String(recipes.length)} open={sideOpen} />
            <NavBtn label="Temporada" icon="❋" active={section === "seasonal"} onClick={() => setSection("seasonal")} open={sideOpen} />
            <NavBtn label="Márgenes" icon="◧" active={section === "margins"} onClick={() => setSection("margins")} open={sideOpen} />
            {/* Bonos simples (piloto): prepago org-scoped, independiente de exam-pass */}
            <NavBtn label="Bonos" icon="✦" active={section === "vouchers"} onClick={() => setSection("vouchers")} open={sideOpen} />
            {/* Clientes simples: agenda org-scoped, independiente de customer_profiles (loyalty) */}
            <NavBtn label="Clientes" icon="◎" active={section === "contacts"} onClick={() => setSection("contacts")} open={sideOpen} />
            {/* Profundidad de costes (piloto): mismas secciones org-scoped que Raíz */}
            <NavGroup label="Tus costes" open={sideOpen} />
            <NavBtn label="Materias primas" icon="▧" active={section === "catalog"} onClick={() => { setSection("catalog"); fetchCatalog(); }} badge={String(catalog.length)} open={sideOpen} />
            <NavBtn label="Proveedores" icon="▥" active={section === "suppliers" || section === "supplierDetail"} onClick={() => { setSection("suppliers"); fetchSuppliers(); }} badge={String(suppliers.length)} open={sideOpen} />
            <NavBtn label="Facturas" icon="▤" active={section === "invoices"} onClick={() => setSection("invoices")} open={sideOpen} />
            <NavBtn label="Inventario" icon="▦" active={section === "inventoryBrain"} onClick={() => setSection("inventoryBrain")} open={sideOpen} />
            <NavBtn label="SKU Master" icon="▣" active={section === "skus" || section === "skuDetail"} onClick={() => { setSection("skus"); fetchSkus(); fetchPackagings(); }} badge={String(skus.length)} open={sideOpen} />
            <NavGroup label="Sistema" open={sideOpen} />
            <NavBtn label="Configuración" icon="⚙" active={section === "config"} onClick={() => setSection("config")} open={sideOpen} />
          </>
        )}

        {/* ═══ NAV RAÍZ — intacta; oculta para Enverde (2.2a) ═══ */}
        {!isEnverde && (
        <>
        {/* ═══ 1 · OPERACIONES — lo que abres a diario para decidir ═══ */}
        <NavGroup label="Operaciones" open={sideOpen} />
        <NavBtn label="Inicio" icon="◉" active={section === "home"} onClick={() => setSection("home")} open={sideOpen} />
        <NavBtn label="Tesorería" icon="◈" active={section === "treasury"} onClick={() => setSection("treasury")} open={sideOpen} />
        <NavBtn label="Márgenes" icon="◈" active={section === "margins"} onClick={() => setSection("margins")} open={sideOpen} />
        <NavBtn label="Inventario POS" icon="▩" active={section === "inventory"} onClick={() => { setSection("inventory"); fetchInventory(); }} open={sideOpen} />
        {showAdvanced && (
          <NavBtn label="Inventario MP" icon="▦" active={section === "inventoryBrain"} onClick={() => setSection("inventoryBrain")} open={sideOpen} />
        )}

        {/* ═══ 2 · PRODUCTO Y COMPRAS — catálogo + lo que compras ═══ */}
        <NavGroup label="Producto y compras" open={sideOpen} />
        <NavBtn label="SKU Master" icon="▣" active={section === "skus" || section === "skuDetail"} onClick={() => { setSection("skus"); fetchSkus(); fetchPackagings(); }} badge={String(skus.length)} open={sideOpen} />
        <NavBtn label="Escandallos" icon="▤" active={section === "recipes" || section === "detail"} onClick={() => { if (section === "detail") goBack(); else setSection("recipes"); }} badge={String(recipes.length)} open={sideOpen} />
        <NavBtn label="Materias primas" icon="▧" active={section === "catalog"} onClick={() => { setSection("catalog"); fetchCatalog(); }} badge={String(catalog.length)} open={sideOpen} />
        <NavBtn label="Productos" icon="▨" active={section === "products"} onClick={() => { setSection("products"); fetchProducts(); }} badge={String(products.length)} open={sideOpen} />
        <NavBtn label="Temporada" icon="❋" active={section === "seasonal"} onClick={() => setSection("seasonal")} open={sideOpen} />
        <NavBtn label="Proveedores" icon="▥" active={section === "suppliers" || section === "supplierDetail"} onClick={() => { setSection("suppliers"); fetchSuppliers(); }} badge={String(suppliers.length)} open={sideOpen} />
        <NavBtn label="Facturas" icon="▤" active={section === "invoices"} onClick={() => setSection("invoices")} open={sideOpen} />
        {showAdvanced && brand.key === "raiz" && (
          <NavBtn label="Combos Profes" icon="☕" active={section === "combos"} onClick={() => setSection("combos")} open={sideOpen} />
        )}

        {/* ═══ 3 · CLIENTES — gamificación Raíz (experimental + solo marca Raíz; un café enverde no la ve) ═══ */}
        {showAdvanced && brand.key === "raiz" && (
          <>
            <NavGroup label="Clientes" open={sideOpen} />
            <NavBtn label="Clientes" icon="◎" active={section === "customers"} onClick={() => setSection("customers")} open={sideOpen} />
            <NavBtn label="Recompensas" icon="★" active={section === "rewards"} onClick={() => setSection("rewards")} open={sideOpen} />
            <NavBtn label="Eventos" icon="◇" active={section === "events"} onClick={() => setSection("events")} open={sideOpen} />
            <NavBtn label="Quizzes" icon="◆" active={section === "quizzes"} onClick={() => setSection("quizzes")} open={sideOpen} />
            <NavBtn label="Misiones" icon="◈" active={section === "missions"} onClick={() => setSection("missions")} open={sideOpen} />
          </>
        )}

        {/* ═══ 4 · SISTEMA — fontanería e integraciones ═══ */}
        <NavGroup label="Sistema" open={sideOpen} />
        <NavBtn label="Conexión POS" icon="⇄" active={section === "posLink"} onClick={() => setSection("posLink")} open={sideOpen} />
        <NavBtn label="Configuración" icon="⚙" active={section === "config"} onClick={() => setSection("config")} open={sideOpen} />
        {brand.key === "raiz" && <NavBtn label="Control Tower" icon="◉" active={false} onClick={() => window.open("/control-tower", "_blank")} open={sideOpen} />}
        <NavBtn label="Escandallos App" icon="↗" active={false} onClick={() => window.open("/escandallo", "_blank")} open={sideOpen} />
        {showAdvanced && (
          <>
            <NavBtn label="Mejoras" icon="💡" active={section === "reports"} onClick={() => setSection("reports")} open={sideOpen} />
            <NavBtn label="Staging" icon="⌸" active={section === "staging"} onClick={() => setSection("staging")} open={sideOpen} />
          </>
        )}

        {/* ═══ Toggle avanzado ═══ */}
        <button
          onClick={() => {
            const next = !showAdvanced;
            setShowAdvanced(next);
            // Si oculta avanzado y está viendo una sección experimental, vuelve a Inicio.
            if (!next && EXPERIMENTAL_SECTIONS.has(section)) setSection("home");
          }}
          style={{
            margin: "16px 12px 4px",
            padding: "8px 12px",
            background: "transparent",
            border: `1px dashed ${T.sidebarBorder}`,
            borderRadius: 8,
            color: T.sidebarDim,
            fontSize: 11,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: T.font,
          }}
          title={showAdvanced ? "Ocultar las 8 secciones avanzadas" : "Mostrar 8 secciones avanzadas / experimentales"}
        >
          {sideOpen ? (showAdvanced ? "− Ocultar avanzado" : "+ Mostrar avanzado (8)") : (showAdvanced ? "−" : "+")}
        </button>
        </>
        )}

        <div style={{ flex: 1 }} />
        {/* Footer */}
        <div style={{ borderTop: `1px solid ${T.sidebarBorder}`, padding: sideOpen ? "14px 14px 8px" : "14px 4px 8px", marginTop: 8 }}>
          {sideOpen ? (
            <>
              <div style={{ fontSize: 12, color: T.sidebarDim, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={syncPos} disabled={syncing} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", background: T.sidebarHover, color: T.sidebarAccent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{syncing ? "..." : "↻ Sync"}</button>
                <button onClick={logout} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: T.sidebarHover, color: T.sidebarDim, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Salir</button>
              </div>
            </>
          ) : (
            <button onClick={logout} title="Cerrar sesión" style={{ width: "100%", padding: 8, borderRadius: 8, border: "none", background: T.sidebarHover, color: T.sidebarDim, fontSize: 14, cursor: "pointer" }}>↪</button>
          )}
        </div>
      </nav>

      <main style={{ flex: 1, overflow: "auto", maxHeight: "100vh", background: T.bg }}>

        {/* Sync notification */}
        {syncResult && syncResult.changes.length > 0 && (
          <div style={{ background: T.successBg, borderBottom: `1px solid #bbf7d0`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: T.success }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span>✓</span> {syncResult.changes.length} precio(s) actualizado(s) desde POS</span>
            <button onClick={() => setSyncResult(null)} style={btnGhost}>✕</button>
          </div>
        )}

        {/* Error banners */}
        <ErrorBanner message={errors.products} onRetry={fetchProducts} onDismiss={() => setErrors(e => ({ ...e, products: "" }))} />
        <ErrorBanner message={errors.inventory} onRetry={fetchInventory} onDismiss={() => setErrors(e => ({ ...e, inventory: "" }))} />
        <ErrorBanner message={errors.catalog} onRetry={fetchCatalog} onDismiss={() => setErrors(e => ({ ...e, catalog: "" }))} />
        <ErrorBanner message={errors.recipes} onRetry={fetchRecipes} onDismiss={() => setErrors(e => ({ ...e, recipes: "" }))} />
        <ErrorBanner message={errors.skus} onRetry={fetchSkus} onDismiss={() => setErrors(e => ({ ...e, skus: "" }))} />
        <ErrorBanner message={errors.suppliers} onRetry={fetchSuppliers} onDismiss={() => setErrors(e => ({ ...e, suppliers: "" }))} />
        <ErrorBanner message={errors.dashboard} onRetry={fetchDashboard} onDismiss={() => setErrors(e => ({ ...e, dashboard: "" }))} />

        {/* ═══════ HOME ═══════ */}
        {section === "home" && (
          <HomeSection
            products={products}
            recipes={recipes}
            skusCount={skus.length}
            suppliersCount={suppliers.length}
            dashboard={dashboard}
            dashLoading={dashLoading}
            fcColor={fcColor}
            fcBg={fcBg}
            fcLabel={fcLabel}
            onNavigate={(s) => {
              setSection(s as Section);
              if (s === "products") fetchProducts();
              if (s === "skus") { fetchSkus(); fetchPackagings(); }
              if (s === "suppliers") fetchSuppliers();
            }}
            onFetchDashboard={fetchDashboard}
            onCreateRecipeForProduct={createRecipeForProduct}
          />
        )}

        {/* ═══════ CONFIG ═══════ */}
        {section === "config" && (
          <OrgConfigSection
            config={orgConfig}
            loading={configLoading}
            onUpdate={updateConfig}
          />
        )}

        {/* ═══════ PRODUCTS (POS) ═══════ */}
        {section === "products" && (
          <div style={page}>
            <h1 style={pageTitle}>Productos del POS</h1>
            <p style={pageSub}>{products.length} productos · {linkedRecipes.length} con escandallo</p>
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              <FilterTab label="Todos" count={products.length} active={prodFilter === "all"} onClick={() => setProdFilter("all")} />
              <FilterTab label="Sin escandallo" count={unlinkedProducts.length} active={prodFilter === "no-recipe"} onClick={() => setProdFilter("no-recipe")} color="#dc2626" />
              {categories.map(c => <FilterTab key={c.id} label={c.name} count={products.filter(p => p.categoryId === c.id).length} active={prodFilter === c.id} onClick={() => setProdFilter(c.id)} />)}
            </div>
            {products.length === 0 ? (
              <div style={{ ...tableWrap, padding: 40, textAlign: "center" }}>
                <p style={{ color: T.muted, fontSize: 14 }}>No hay productos en el POS.</p>
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={tbl}><thead><tr style={trHead}>{["Producto", "Categoría", "PVP", "Coste", "Margen", "Food cost", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>{products.filter(p => { if (prodFilter === "all") return true; if (prodFilter === "no-recipe") return !recipeByProduct[p.id]; return p.categoryId === prodFilter; }).map(p => {
                  const recipe = recipeByProduct[p.id]; const tc = recipe?.totalCost || 0; const fc = recipe?.foodCostPct || 0; const margin = p.price - tc;
                  return <tr key={p.id} style={trBody}><td style={td}><div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>{p.origin && <div style={{ fontSize: 10, color: T.dim }}>{p.origin}</div>}</td><td style={{ ...td, color: T.muted, fontSize: 12 }}>{p.categoryName}</td><td style={{ ...tdR, fontWeight: 600 }}>{fmt(p.price)}€</td><td style={tdR}>{recipe ? `${fmt(tc)}€` : <span style={{ color: T.dim }}>—</span>}</td><td style={{ ...tdR, color: recipe ? "#16a34a" : T.dim }}>{recipe ? `${fmt(margin)}€` : "—"}</td><td style={tdR}>{recipe ? <span style={{ ...badge, color: fcColor(fc), background: fcBg(fc) }}>{fmt(fc)}%</span> : <span style={{ color: T.dim }}>—</span>}</td><td style={{ padding: "12px 8px", textAlign: "right" }}>{recipe ? <button onClick={() => openRecipe(recipe)} style={btnSmall}>Ver</button> : <button onClick={() => createRecipeForProduct(p)} disabled={saving} style={{ ...btnSmall, color: T.accent, borderColor: T.accent40 }}>+ Escandallo</button>}</td></tr>;
                })}{products.filter(p => { if (prodFilter === "all") return true; if (prodFilter === "no-recipe") return !recipeByProduct[p.id]; return p.categoryId === prodFilter; }).length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.dim }}>No hay productos en este filtro.</td></tr>}</tbody></table>
              </div>
            )}
          </div>
        )}

        {/* ═══════ SKU MASTER ═══════ */}
        {section === "skus" && (
          <div style={page}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h1 style={pageTitle}>SKU Master</h1><p style={pageSub}>Catálogo maestro: producto → receta → packaging → coste → estación</p></div>
              <button onClick={() => { fetchRecipes(); fetchPackagings(); setModal("newSku"); }} style={btnPrimary}>+ Nuevo SKU</button>
            </div>

            {skus.length === 0 ? (
              <div style={{ ...tableWrap, padding: 40, textAlign: "center" }}>
                <p style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>Aún no tienes SKUs. Cada SKU conecta un producto con su receta, packaging, estación y controles de calidad.</p>
                <button onClick={() => setModal("newSku")} style={btnPrimary}>Crear primer SKU</button>
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={tbl}><thead><tr style={trHead}>{["SKU", "Estación", "Tiempo", "Receta", "Packaging", "PVP", "Coste", "Margen", "FC%", "v", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 5 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>{skus.map(s => (
                  <tr key={s.id} onClick={() => openSku(s)} style={{ ...trBody, cursor: "pointer" }}>
                    <td style={td}><div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div><div style={{ fontSize: 10, color: T.dim }}>{s.category} {s.allergens?.length > 0 && `· ⚠ ${s.allergens.join(", ")}`}</div></td>
                    <td style={td}><span title={s.station}>{stationEmoji[s.station] || s.station}</span> <span style={{ fontSize: 11, color: T.muted }}>{s.station}</span></td>
                    <td style={td}><span style={{ fontFamily: T.mono, fontSize: 12 }}>{s.standardTimeSec > 0 ? `${s.standardTimeSec}s` : "—"}</span></td>
                    <td style={td}><span style={{ fontSize: 12, color: s.recipeId ? "#16a34a" : T.dim }}>{s.recipeId ? "✓" : "—"}</span></td>
                    <td style={td}><span style={{ fontSize: 12, color: s.packagingId ? "#16a34a" : T.dim }}>{s.packagingId ? "✓" : "—"}</span></td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmt(s.sellingPrice)}€</td>
                    <td style={tdR}>{fmt(s.totalCost)}€</td>
                    <td style={{ ...tdR, color: s.margin > 0 ? "#16a34a" : "#dc2626" }}>{fmt(s.margin)}€</td>
                    <td style={tdR}><span style={{ ...badge, color: fcColor(s.foodCostPct), background: fcBg(s.foodCostPct) }}>{fmt(s.foodCostPct)}%</span></td>
                    <td style={{ ...tdR, color: T.dim, fontSize: 11 }}>v{s.version}</td>
                    <td style={{ padding: "14px 8px", textAlign: "right" }}><button onClick={e => { e.stopPropagation(); deleteSku(s.id, s.name); }} style={btnGhost} title="Eliminar">✕</button></td>
                  </tr>
                ))}</tbody></table>
              </div>
            )}
          </div>
        )}

        {/* ═══════ SKU DETAIL ═══════ */}
        {section === "skuDetail" && selectedSku && (() => {
          const s = selectedSku;
          return (
            <div style={page}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => { setSection("skus"); fetchSkus(); }} style={{ ...btnGhost, fontSize: 18 }}>←</button>
                <div style={{ flex: 1 }}>
                  <h1 style={{ ...pageTitle, marginBottom: 0 }}>{s.name}</h1>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.dim }}>{s.category}</span>
                    <span style={{ fontSize: 11, color: T.muted, background: T.bg, padding: "2px 8px", borderRadius: 4 }}>{stationEmoji[s.station]} {s.station}</span>
                    <span style={{ fontSize: 11, color: T.accent }}>v{s.version}</span>
                    <span style={{ fontSize: 11, color: s.status === "active" ? "#16a34a" : "#ca8a04" }}>{s.status}</span>
                  </div>
                </div>
                <button onClick={() => deleteSku(s.id, s.name)} style={{ ...btnGhost, color: "#dc2626" }}>Borrar</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <Kpi label="PVP" value={`${fmt(s.sellingPrice)}€`} />
                <Kpi label="Coste receta" value={`${fmt(s.recipeCost)}€`} />
                <Kpi label="Coste packaging" value={`${fmt(s.packagingCost)}€`} />
                <Kpi label="Coste total" value={`${fmt(s.totalCost)}€`} />
                <Kpi label="Margen" value={`${fmt(s.margin)}€`} color={s.margin > 0 ? "#16a34a" : "#dc2626"} />
                <Kpi label="Food cost" value={`${fmt(s.foodCostPct)}%`} color={fcColor(s.foodCostPct)} badge={fcLabel(s.foodCostPct)} badgeBg={fcBg(s.foodCostPct)} />
                <Kpi label="Tiempo estándar" value={s.standardTimeSec > 0 ? `${s.standardTimeSec}s` : "—"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                {/* Receta vinculada */}
                <div style={tableWrap}>
                  <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>Receta</span></div>
                  {s.recipeId && recipeMap[s.recipeId] ? (
                    <div style={{ padding: 16 }}>
                      <div style={{ fontWeight: 500 }}>{recipeMap[s.recipeId].name}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Coste: {fmt(recipeMap[s.recipeId].totalCost)}€ · {recipeMap[s.recipeId].yieldQty} {recipeMap[s.recipeId].yieldUnit}</div>
                      <button onClick={() => openRecipe(recipeMap[s.recipeId!])} style={{ ...btnSmall, marginTop: 8 }}>Ver escandallo →</button>
                    </div>
                  ) : (
                    <div style={{ padding: 16 }}>
                      <select onChange={e => { if (e.target.value) updateSku(s.id, { recipeId: e.target.value }); }} style={{ ...input, width: "100%" }}>
                        <option value="">Vincular receta...</option>
                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name} ({fmt(r.totalCost)}€)</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Packaging vinculado */}
                <div style={tableWrap}>
                  <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>Packaging</span></div>
                  {s.packagingId && packMap[s.packagingId] ? (
                    <div style={{ padding: 16 }}>
                      <div style={{ fontWeight: 500 }}>{packMap[s.packagingId].name}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Coste: {fmt(packMap[s.packagingId].totalCost)}€</div>
                      {packMap[s.packagingId].items?.map((it, i) => <div key={i} style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>· {it.name} ({fmt(it.unitCost)}€ x{it.qty})</div>)}
                    </div>
                  ) : (
                    <div style={{ padding: 16 }}>
                      <select onChange={e => { if (e.target.value) updateSku(s.id, { packagingId: e.target.value }); }} style={{ ...input, width: "100%" }}>
                        <option value="">Vincular packaging...</option>
                        {packagings.map(p => <option key={p.id} value={p.id}>{p.name} ({fmt(p.totalCost)}€)</option>)}
                      </select>
                      <button onClick={() => { fetchPackagings(); setModal("newPackaging"); }} style={{ ...btnSmall, marginTop: 8 }}>+ Crear packaging</button>
                    </div>
                  )}
                </div>
              </div>

              {/* QC, Allergens, Substitutions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <EditableList title="Alérgenos" items={s.allergens || []} onSave={items => updateSku(s.id, { allergens: items })} placeholder="Ej: lactosa, gluten..." />
                <EditableList title="QC Checks" items={s.qcChecks || []} onSave={items => updateSku(s.id, { qcChecks: items })} placeholder="Ej: temperatura leche >65°" />
                <div style={tableWrap}>
                  <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>Sustituciones</span></div>
                  <div style={{ padding: 12 }}>
                    {(s.substitutions || []).map((sub, i) => (
                      <div key={i} style={{ fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div>{sub.from} → <strong>{sub.to}</strong></div>
                        <div style={{ fontSize: 11, color: T.muted }}>{sub.costDelta !== 0 ? `Δ coste: ${sub.costDelta > 0 ? "+" : ""}${fmt(sub.costDelta)}€` : "Sin recargo"} {sub.note && `· ${sub.note}`}</div>
                      </div>
                    ))}
                    {(!s.substitutions || s.substitutions.length === 0) && <p style={{ color: T.dim, fontSize: 12 }}>Sin sustituciones</p>}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════ RECIPES LIST ═══════ */}
        {section === "recipes" && (
          <div style={page}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h1 style={pageTitle}>Escandallos</h1><p style={pageSub}>Coste por receta y márgenes</p></div>
              <button onClick={() => setModal("newRecipe")} style={btnPrimary}>+ Nueva receta</button>
            </div>
            <div style={tableWrap}>
              <table style={tbl}><thead><tr style={trHead}>{["Receta", "Producto", "Coste", "PVP", "Margen", "Food cost", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>{recipes.map(r => { const tc = r.totalCost || 0; const est = tc > 0 ? 0 : (r.estimatedUnitCost || 0); const fc = est > 0 && r.sellingPrice > 0 ? (est / r.sellingPrice) * 100 : (r.foodCostPct || 0); const margin = r.sellingPrice - (tc > 0 ? tc : est); return (
                <tr key={r.id} onClick={() => openRecipe(r)} style={{ ...trBody, cursor: "pointer" }}><td style={td}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 11, color: T.dim }}>{r.yieldQty} {r.yieldUnit}</div></td><td style={td}>{r.productId ? <span style={{ color: "#16a34a", fontSize: 12 }}>✓ Vinculado</span> : <span style={{ color: T.dim, fontSize: 12 }}>—</span>}</td><td style={tdR}>{est > 0 ? <><span style={{ color: "#b45309" }}>≈ {fmt(est)}€</span><div style={{ fontSize: 10, color: "#b45309" }}>estimado</div></> : `${fmt(tc)}€`}</td><td style={{ ...tdR, fontWeight: 600 }}>{fmt(r.sellingPrice)}€</td><td style={{ ...tdR, color: est > 0 ? "#b45309" : "#16a34a" }}>{est > 0 ? "≈ " : ""}{fmt(margin)}€</td><td style={tdR}><span style={{ ...badge, color: est > 0 ? "#b45309" : fcColor(fc), background: est > 0 ? "#fef3c7" : fcBg(fc) }}>{est > 0 ? "≈ " : ""}{fmt(fc)}%</span></td><td style={{ padding: "14px 8px", textAlign: "right" }}><button onClick={e => { e.stopPropagation(); deleteRecipe(r.id, r.name); }} style={btnGhost}>✕</button></td></tr>
              ); })}{recipes.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.dim }}>Sin recetas.</td></tr>}</tbody></table>
            </div>
          </div>
        )}

        {/* ═══════ RECIPE DETAIL ═══════ */}
        {section === "detail" && selectedRecipe && (() => {
          const tc = selectedRecipe.totalCost || 0; const est = tc > 0 ? 0 : (selectedRecipe.estimatedUnitCost || 0); const fc = est > 0 && selectedRecipe.sellingPrice > 0 ? (est / selectedRecipe.sellingPrice) * 100 : (selectedRecipe.foodCostPct || 0); const margin = selectedRecipe.sellingPrice - (tc > 0 ? tc : est);
          return (
            <div style={page}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={goBack} style={{ ...btnGhost, fontSize: 18 }}>←</button>
                <div style={{ flex: 1 }}>
                  <h1 style={{ ...pageTitle, marginBottom: 0 }}>{selectedRecipe.name}</h1>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                    <span style={{ color: T.dim, fontSize: 12 }}>{selectedRecipe.yieldQty} {selectedRecipe.yieldUnit}</span>
                    {selectedRecipe.productId ? <span style={{ fontSize: 11, color: "#16a34a", background: T.successBg, padding: "2px 8px", borderRadius: 4 }}>✓ Vinculado al POS</span> : <button onClick={() => setModal("linkProduct")} style={{ fontSize: 11, color: T.accent, background: "none", border: `1px solid ${T.accent40}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: T.font }}>Vincular a producto POS</button>}
                  </div>
                </div>
              </div>
              {est > 0 && (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                  Este escandallo usa un <strong>coste aproximado de {fmt(est)}€</strong> como provisional.
                  Completa el escandallo real añadiendo ingredientes abajo: en cuanto tengan coste, sustituyen al estimado.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <Kpi label="Coste total" value={est > 0 ? `≈ ${fmt(est)}€` : `${fmt(tc)}€`} color={est > 0 ? "#b45309" : undefined} badge={est > 0 ? "estimado" : undefined} badgeBg={est > 0 ? "#fef3c7" : undefined} />
                <div style={kpiBox}><div style={{ ...kpiLbl, display: "flex", alignItems: "center", gap: 6 }}>PVP {!editPrice && <button onClick={() => { setPriceVal(selectedRecipe.sellingPrice); setEditPrice(true); }} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, padding: 0 }}>✎</button>}</div>{editPrice ? <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}><input type="number" step="0.1" value={priceVal} onChange={e => setPriceVal(Number(e.target.value))} style={{ ...input, width: 80, fontFamily: T.mono, fontSize: 16, fontWeight: 700 }} autoFocus onKeyDown={e => { if (e.key === "Enter") updatePrice(priceVal); }} /><button onClick={() => updatePrice(priceVal)} style={{ ...btnSmall, background: T.accent, color: "#fff", border: "none" }} disabled={saving}>OK</button></div> : <div style={kpiVal}>{fmt(selectedRecipe.sellingPrice)}€</div>}</div>
                <Kpi label="Margen" value={`${est > 0 ? "≈ " : ""}${fmt(margin)}€`} color={est > 0 ? "#b45309" : margin > 0 ? "#16a34a" : "#dc2626"} />
                <Kpi label="Food cost" value={`${est > 0 ? "≈ " : ""}${fmt(fc)}%`} color={est > 0 ? "#b45309" : fcColor(fc)} badge={est > 0 ? "estimado" : fcLabel(fc)} badgeBg={est > 0 ? "#fef3c7" : fcBg(fc)} />
              </div>
              <div style={tableWrap}>
                <div style={{ ...tableHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 600, fontSize: 13 }}>Ingredientes</span><button onClick={() => { setShowAddIng(!showAddIng); if (!showAddIng) fetchCatalog(); }} style={btnSmall}>+ Añadir</button></div>
                <table style={tbl}><thead><tr style={trHead}>{["Ingrediente", "Cantidad", "€/ud", "Coste línea", "% total", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i > 0 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>{ingredients.map(ing => { const total = calcTotal(ingredients); const pct = total > 0 ? (ing.lineCost / total) * 100 : 0; return (
                  <tr key={ing.id} style={trBody}><td style={td}>{ing.name}</td><td style={tdR}>{ing.qty} {ing.unit}</td><td style={{ ...tdR, fontSize: 12, color: T.dim }}>{fmt4(ing.unitCost)}€</td><td style={{ ...tdR, fontWeight: 600 }}>{fmt(ing.lineCost)}€</td><td style={{ ...tdR, color: T.muted, fontSize: 12 }}>{fmt(pct)}%</td><td style={{ padding: "12px 8px", textAlign: "right" }}><button onClick={() => removeIngredient(ing.id)} style={btnGhost}>✕</button></td></tr>
                ); })}{ingredients.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: T.dim }}>Sin ingredientes.</td></tr>}</tbody>
                {ingredients.length > 0 && <tfoot><tr><td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13 }}>TOTAL</td><td colSpan={2} /><td style={{ ...tdR, fontWeight: 700, color: T.accent }}>{fmt(calcTotal(ingredients))}€</td><td style={{ ...tdR, fontWeight: 600, color: T.muted }}>100%</td><td /></tr></tfoot>}
                </table>
              </div>
              {showAddIng && <AddIngPanel catalog={catalog} onAdd={addIngredient} onClose={() => setShowAddIng(false)} saving={saving} />}

              {ingredients.length > 1 && (() => { const total = calcTotal(ingredients); const colors = ["#8b6f47", "#4a7c8a", "#6a8a4a", "#8a4a6a", "#6b5839", "#a08060"]; return (
                <div style={{ ...tableWrap, padding: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: T.muted }}>Desglose</div>
                  <div style={{ display: "flex", gap: 2, height: 22, borderRadius: 5, overflow: "hidden" }}>{ingredients.map((ing, i) => { const pct = total > 0 ? (ing.lineCost / total) * 100 : 0; return <div key={ing.id} title={`${ing.name}: ${fmt(pct)}%`} style={{ width: `${pct}%`, minWidth: pct > 2 ? 16 : 3, background: colors[i % colors.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{pct > 15 ? ing.name.split(" ")[0] : ""}</div>; })}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 8 }}>{ingredients.map((ing, i) => { const pct = total > 0 ? (ing.lineCost / total) * 100 : 0; return <div key={ing.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}><div style={{ width: 6, height: 6, borderRadius: 2, background: colors[i % colors.length] }} />{ing.name} ({fmt(pct)}%)</div>; })}</div>
                </div>
              ); })()}
            </div>
          );
        })()}

        {/* ═══════ CATALOG ═══════ */}
        {section === "catalog" && (
          <div style={page}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h1 style={pageTitle}>Materias primas</h1><p style={pageSub}>{catalog.length} artículos</p></div>
              <button onClick={() => setModal("newCatalog")} style={btnPrimary}>+ Nuevo artículo</button>
            </div>
            <input placeholder="Buscar..." value={catSearch} onChange={e => setCatSearch(e.target.value)} style={{ ...input, width: "100%", maxWidth: 340, marginBottom: 20 }} />
            <div style={tableWrap}><table style={tbl}><thead><tr style={trHead}>{["Artículo", "Proveedor", "Pack", "€/pack", "Coste unitario", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 3 && i <= 4 ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>{catalog.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()) || c.supplier.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
              <tr key={c.id} style={trBody}><td style={td}><div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div><div style={{ fontSize: 11, color: T.dim }}>{c.baseUnit}</div></td><td style={{ ...td, color: T.muted, fontSize: 13 }}>{c.supplier}</td><td style={{ ...td, fontSize: 12, color: T.dim }}>{c.packQty} {c.baseUnit} ({c.packUnit})</td><td style={tdR}>{fmt(c.packCost)}€</td><td style={tdR}><span style={{ fontFamily: T.mono, fontSize: 12, color: T.accent, fontWeight: 600 }}>{fmt4(c.unitCost)}€/{c.baseUnit}</span></td><td style={{ padding: "14px 8px", textAlign: "right" }}><button onClick={() => deleteCatalogItem(c.id, c.name)} style={btnGhost} title="Eliminar">✕</button></td></tr>
            ))}{catalog.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.dim }}>Sin artículos.</td></tr>}</tbody></table></div>
          </div>
        )}

        {/* ═══════ SUPPLIERS ═══════ */}
        {section === "suppliers" && (
          <div style={page}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h1 style={pageTitle}>Proveedores</h1><p style={pageSub}>{suppliers.length} proveedores</p></div>
              <button onClick={() => setModal("newSupplier")} style={btnPrimary}>+ Nuevo proveedor</button>
            </div>
            {suppliers.length === 0 ? (
              <div style={{ ...tableWrap, padding: 40, textAlign: "center" }}>
                <p style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>Añade tus proveedores para organizar las facturas</p>
                <button onClick={() => setModal("newSupplier")} style={btnPrimary}>Añadir primer proveedor</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {suppliers.map(s => (
                  <div key={s.id} onClick={() => openSupplier(s)} style={{ ...tableWrap, padding: 18, cursor: "pointer", position: "relative" }}>
                    <button onClick={e => { e.stopPropagation(); deleteSupplier(s.id, s.name); }} style={{ ...btnGhost, position: "absolute", top: 8, right: 8, fontSize: 11, color: T.dim, padding: "2px 6px" }} title="Eliminar">✕</button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div><div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>{s.contact && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{s.contact}</div>}</div>
                      <span style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: T.accent, marginRight: 20 }}>{s.invoiceCount}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>{s.invoiceCount} factura(s) · {s.phone || s.email || "Sin contacto"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ SUPPLIER DETAIL ═══════ */}
        {section === "supplierDetail" && selectedSupplier && (
          <div style={page}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <button onClick={() => { setSection("suppliers"); fetchSuppliers(); }} style={{ ...btnGhost, fontSize: 18 }}>←</button>
              <div style={{ flex: 1 }}>
                <h1 style={{ ...pageTitle, marginBottom: 0 }}>{selectedSupplier.name}</h1>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{[selectedSupplier.contact, selectedSupplier.phone, selectedSupplier.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</div>
              </div>
              <button onClick={() => deleteSupplier(selectedSupplier.id, selectedSupplier.name)} style={{ ...btnGhost, color: "#dc2626", fontSize: 12 }}>Borrar</button>
            </div>

            {/* Invoice upload */}
            <SupplierInvoiceUpload user={user} supplierId={selectedSupplier.id} orgId={orgId} onUploaded={() => fetchSupplierDetail(selectedSupplier.id)} />

            {/* Invoice history */}
            <div style={{ ...tableWrap, marginTop: 20 }}>
              <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>Facturas ({supplierInvoices.length})</span></div>
              {supplierInvoices.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Sin facturas aún</div>
              ) : supplierInvoices.map((inv, i) => (
                <div key={i} style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 500 }}>{String(inv.invoiceNumber || inv.fileName || `Factura ${i + 1}`)}</div><div style={{ fontSize: 11, color: T.dim }}>{String(inv.date || "—")}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontFamily: T.mono, fontWeight: 600 }}>{fmt(Number(inv.total) || 0)}€</div><div style={{ fontSize: 11, color: String(inv.status) === "applied" ? "#16a34a" : "#ca8a04" }}>{String(inv.status) || "pending"}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════ INVENTORY (POS) ═══════ */}
        {section === "inventory" && (
          <div style={page}>
            <h1 style={pageTitle}>Inventario del POS</h1>
            <p style={pageSub}>Lectura directa del POS · {inventory.length} artículos</p>
            {inventory.length === 0 ? (
              <div style={{ ...tableWrap, padding: 40, textAlign: "center" }}><p style={{ color: T.muted }}>Inventario POS vacío.</p></div>
            ) : (
              <div style={tableWrap}><table style={tbl}><thead><tr style={trHead}>{["Artículo", "Stock", "Mín", "Proveedor", "Estado"].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 1 && i <= 2 ? "right" : "left" }}>{h}</th>)}</tr></thead><tbody>{inventory.map(it => { const low = it.stock <= it.minStock; return <tr key={it.id} style={trBody}><td style={td}><div style={{ fontWeight: 500 }}>{it.name}</div><div style={{ fontSize: 11, color: T.dim }}>{it.categoryName}</div></td><td style={{ ...tdR, color: low ? "#dc2626" : T.text }}>{it.stock} {it.unit}</td><td style={{ ...tdR, color: T.dim }}>{it.minStock}</td><td style={{ ...td, color: T.muted, fontSize: 13 }}>{it.supplier}</td><td style={td}>{low ? <span style={{ ...badge, color: "#dc2626", background: T.dangerBg }}>Stock bajo</span> : <span style={{ color: "#16a34a", fontSize: 11 }}>OK</span>}</td></tr>; })}</tbody></table></div>
            )}
          </div>
        )}

        {/* ═══════ INVOICES ═══════ */}
        {section === "invoices" && <InvoiceSection user={user} catalog={catalog} onCatalogUpdate={() => { fetchCatalog(); fetchRecipes(); }} S={T} orgId={orgId} />}

        {/* ═══════ STAGING (singularidad-engine pipeline) ═══════ */}
        {section === "staging" && user && <StagingSection user={user} />}

        {/* ═══════ TREASURY ═══════ */}
        {section === "treasury" && user && orgId && <TreasurySection user={user} orgId={orgId} />}

        {/* ═══════ CUSTOMERS (NEW) ═══════ */}
        {section === "customers" && user && orgId && <CustomersSection user={user} orgId={orgId} />}

        {/* ═══════ VOUCHERS (bonos simples Enverde) ═══════ */}
        {section === "vouchers" && user && orgId && <VouchersSection user={user} orgId={orgId} />}

        {/* ═══════ CONTACTS (clientes simples Enverde) ═══════ */}
        {section === "contacts" && user && orgId && <ContactsSection user={user} orgId={orgId} />}

        {/* ═══════ REWARDS (NEW) ═══════ */}
        {section === "rewards" && user && orgId && <RewardsSection user={user} orgId={orgId} />}

        {/* ═══════ EVENTS (NEW) ═══════ */}
        {section === "events" && user && orgId && <EventsSection user={user} orgId={orgId} />}

        {/* ═══════ QUIZZES (NEW) ═══════ */}
        {section === "quizzes" && user && orgId && <QuizzesSection user={user} orgId={orgId} />}

        {/* ═══════ MISSIONS (NEW) ═══════ */}
        {section === "missions" && user && orgId && <MissionsSection user={user} orgId={orgId} authedFetch={authedFetch} />}

        {/* ═══════ MARGINS DASHBOARD ═══════ */}
        {section === "margins" && user && orgId && (
          <MarginsSection user={user} orgId={orgId} fcColor={fcColor} fcBg={fcBg} fcLabel={fcLabel} authedFetch={authedFetch} />
        )}

        {/* ═══════ INVENTORY (Brain) ═══════ */}
        {section === "inventoryBrain" && user && orgId && (
          <InventorySection user={user} orgId={orgId} authedFetch={authedFetch} />
        )}

        {/* ═══════ SEASONAL RECIPES ═══════ */}
        {section === "seasonal" && user && orgId && (
          <SeasonalRecipesSection user={user} orgId={orgId} authedFetch={authedFetch} />
        )}

        {/* ═══════ POS LINK ═══════ */}
        {section === "posLink" && user && orgId && (
          <PosLinkSection user={user} orgId={orgId} authedFetch={authedFetch} onOpenRecipe={async (recipeId) => { setSection("detail"); await fetchDetail(recipeId); }} />
        )}

        {/* ═══════ MEETING COMBOS ═══════ */}
        {section === "combos" && user && orgId && <MeetingCombosSection user={user} orgId={orgId} />}

        {/* ═══════ REPORTS / MEJORAS ═══════ */}
        {section === "reports" && user && orgId && <ReportsSection user={user} orgId={orgId} />}

      </main>

      {/* ── Modals ── */}
      {modal === "newRecipe" && <Overlay onClose={() => setModal(null)}><NewRecipeForm onSave={createRecipe} saving={saving} onClose={() => setModal(null)} /></Overlay>}
      {modal === "newCatalog" && <Overlay onClose={() => setModal(null)}><NewCatalogForm onSave={createCatalogItem} saving={saving} onClose={() => setModal(null)} /></Overlay>}
      {modal === "newSku" && <Overlay onClose={() => setModal(null)}><NewSkuForm products={products} recipes={recipes} packagings={packagings} onSave={createSku} saving={saving} onClose={() => setModal(null)} /></Overlay>}
      {modal === "newPackaging" && <Overlay onClose={() => setModal(null)}><NewPackagingForm onSave={createPackaging} saving={saving} onClose={() => setModal(null)} /></Overlay>}
      {modal === "newSupplier" && <Overlay onClose={() => setModal(null)}><NewSupplierForm onSave={createSupplier} saving={saving} onClose={() => setModal(null)} /></Overlay>}
      {modal === "linkProduct" && selectedRecipe && (
        <Overlay onClose={() => setModal(null)}>
          <h2 style={modalTitle}>Vincular a producto POS</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: "-12px 0 16px" }}>Selecciona un producto sin escandallo vinculado</p>
          {products.filter(p => !recipeByProduct[p.id]).length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: T.dim, fontSize: 13 }}>Todos los productos ya tienen escandallo.</div>
          ) : (
            <div style={{ maxHeight: 320, overflow: "auto", borderRadius: 10, border: `1px solid ${T.border}` }}>{products.filter(p => !recipeByProduct[p.id]).map((p, i, arr) => (
              <button key={p.id} onClick={() => linkProduct(selectedRecipe.id, p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${T.borderLight}` : "none", color: T.text, cursor: "pointer", fontFamily: T.font, fontSize: 13, transition: "background 0.1s" }}>
                <div><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{p.categoryName}</div></div>
                <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.accent }}>{fmt(p.price)}€</span>
              </button>
            ))}</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={() => setModal(null)} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancelar</button>
          </div>
        </Overlay>
      )}
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* ─── Shared Components ──────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════ */

function SupplierInvoiceUpload({ user, supplierId, orgId, onUploaded }: { user: User; supplierId: string; orgId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = async (file: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try { await authedFetch(user, `/api/org/${orgId}/suppliers/${supplierId}/invoices`, { method: "POST", body: fd }); onUploaded(); } catch (e) { console.error(e); } finally { setUploading(false); }
  };
  return (
    <div onClick={() => !uploading && ref.current?.click()} style={{ background: T.surface, border: `2px dashed ${T.border}`, borderRadius: 14, padding: "28px 24px", textAlign: "center", cursor: uploading ? "wait" : "pointer", transition: "border-color 0.15s" }}>
      <input ref={ref} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      {uploading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: T.muted }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 14 }}>Procesando factura con IA...</span>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>📄 Subir factura PDF</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>Claude extraerá proveedor, artículos y precios</div>
        </div>
      )}
    </div>
  );
}

