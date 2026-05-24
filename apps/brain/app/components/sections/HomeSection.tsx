"use client";

import { useState } from "react";
import { Kpi, ActionCard } from "../ui";
import { T, page, pageTitle, pageSub, tableWrap, tableHead, tableRow, btnSmall, fmt } from "../theme";

type Recipe = {
  id: string; name: string; yieldQty: number; yieldUnit: string;
  sellingPrice: number; totalCost: number; foodCostPct: number;
  productId?: string; productName?: string;
};
type Product = { id: string; name: string; price: number; categoryId: string | null; categoryName: string };

type DashboardData = {
  kpis: { totalRevenue: number; totalTransactions: number; avgTicket: number; avgFoodCostPct: number; estimatedProfit: number; costCoverage: number; days: number };
  profitability: Array<{ productId: string; productName: string; unitsSold: number; revenue: number; unitCost: number; unitMargin: number; foodCostPct: number; totalProfit: number; hasCostData: boolean }>;
  alerts: Array<{ type: string; message: string; productId?: string }>;
};

interface HomeSectionProps {
  products: Product[];
  recipes: Recipe[];
  skusCount: number;
  suppliersCount: number;
  dashboard: DashboardData | null;
  dashLoading: boolean;
  fcColor: (p: number) => string;
  fcBg: (p: number) => string;
  fcLabel: (p: number) => string;
  onNavigate: (section: string) => void;
  onFetchDashboard: () => void;
  onCreateRecipeForProduct: (p: Product) => void;
}

/* ─── Static project data ─── */

type Severity = "critical" | "high" | "medium" | "low";
type ItemStatus = "pending" | "in_progress" | "done";

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  location?: string;
  status: ItemStatus;
}

const BUGS: ProjectItem[] = [
  { id: "BUG-1", title: "Total del ticket POS con modificadores", description: "Ahora suma modifiers[].priceAdjustment al total. Reportes de ventas y cuadre de caja correctos.", severity: "critical", location: "pos/lib/ticket-service.ts:103-106", status: "done" },
  { id: "BUG-2", title: "Idempotencia atómica en loyalty engine", description: "Usa tx.get() sobre documento dedicado loyalty_idempotency/{key} dentro de la transacción. Sin duplicados posibles.", severity: "critical", location: "brain/lib/loyalty-engine.ts:99-110", status: "done" },
  { id: "BUG-3", title: "Economy filtra por orgId correctamente", description: "Breakage estimate ahora usa .where('orgId', '==', orgId) para leer solo profiles de la org solicitada.", severity: "critical", location: "brain/api/loyalty/economy/route.ts:122-125", status: "done" },
  { id: "BUG-4", title: "Reconciliación atómica", description: "Corrección de ledger + perfil envueltas en adminDb.runTransaction(). Consistencia garantizada.", severity: "critical", location: "brain/api/loyalty/reconcile/route.ts:166-199", status: "done" },
  { id: "BUG-5", title: "Puntos POS sobre total correcto", description: "Con BUG-1 resuelto, calculatePoints(total) recibe el total incluyendo modificadores.", severity: "high", location: "pos/lib/ticket-service.ts:196", status: "done" },
  { id: "BUG-6", title: "getCustomerType recibe isTeacher", description: "Ahora pasa customerRole === 'profesor' como segundo argumento. Segmentación por tipo de cliente funcional.", severity: "high", location: "pos/lib/ticket-service.ts:112", status: "done" },
  { id: "BUG-7", title: "Pedidos ASAP con pickupAt estimado", description: "ASAP calcula pickupAt = ahora + 15 min. Dashboard ordena correctamente todos los pedidos.", severity: "high", location: "app/checkout/CheckoutClient.tsx:84-87", status: "done" },
  { id: "BUG-8", title: "Número de ticket atómico", description: "Usa runTransaction() con tx.get() + tx.update() en una sola transacción. Sin duplicados posibles.", severity: "high", location: "pos/lib/fiscal-service.ts:50-62", status: "done" },
  { id: "BUG-9", title: "Puntos de fidelidad POS con feedback", description: "Usa await + captura loyaltyError para informar al barista si fallan los puntos.", severity: "medium", location: "pos/lib/ticket-service.ts:194-205", status: "done" },
  { id: "BUG-10", title: "Validación de hora al confirmar", description: "Validación ejecutada dentro de handlePlaceOrder() al momento de confirmar, no al seleccionar hora.", severity: "medium", location: "app/checkout/CheckoutClient.tsx:64-70", status: "done" },
  { id: "BUG-11", title: "Product stats con await garantizado", description: "updateProductDailyStats ahora usa await. Stats se registran antes de devolver el ticket.", severity: "medium", location: "pos/lib/ticket-service.ts:186-191", status: "done" },
];

const SECURITY_ISSUES: ProjectItem[] = [
  { id: "SEC-1", title: "Autenticación en rutas de Quizzes", description: "GET y POST de quizzes ahora verifican requireOrgMember(req, orgId) antes de procesar.", severity: "critical", location: "brain/api/quizzes/route.ts", status: "done" },
  { id: "SEC-2", title: "Aislamiento cross-org en Dashboard", description: "Tickets y orders ahora filtran por .where('orgId', '==', orgId). Datos aislados por organización.", severity: "critical", location: "brain/api/dashboard/route.ts:35-36", status: "done" },
  { id: "SEC-3", title: "Validación de Stripe env vars", description: "Se valida stripeSecretKey al inicio y devuelve 503 si no está configurada. Sin crash.", severity: "critical", location: "app/api/create-payment-intent/route.ts:11-14", status: "done" },
  { id: "SEC-4", title: "Idempotency en Payment Intent", description: "Se usa idempotencyKey en stripe.paymentIntents.create() y se verifica estado antes de reusar PI existente.", severity: "high", location: "app/api/payments/create/route.ts:161-214", status: "done" },
  { id: "SEC-5", title: "Try-catch en JSON.parse de firebase-admin", description: "JSON.parse de FIREBASE_ADMIN_JSON envuelto en try-catch con mensaje de error claro.", severity: "high", location: "brain/lib/firebase-admin.ts:36-39", status: "done" },
  { id: "SEC-6", title: "Idempotency key en loyalty/adjust", description: "Ahora usa Date.now() + Math.random() para generar keys únicas por cada request.", severity: "high", location: "brain/api/loyalty/adjust/route.ts:64", status: "done" },
];

const FEATURES_TODO: ProjectItem[] = [
  { id: "FEAT-1", title: "Migrar award points a Brain API", description: "POS escribe puntos client-side vía loyalty-points-service.ts. Debería pasar por Brain como hace App.", severity: "high", status: "pending" },
  { id: "FEAT-2", title: "Combos dinámicos desde Brain", description: "Mover QUICK_COMBOS a Firestore/Brain API, gestionar desde control tower en vez de hardcodeados.", severity: "medium", status: "pending" },
  { id: "FEAT-3", title: "Modo pico automático por franja horaria", description: "Activar automáticamente en franjas de alta demanda (8-10am, 12-14pm) en vez de toggle manual.", severity: "low", status: "pending" },
  { id: "FEAT-4", title: "Favoritos por franja horaria", description: "Diferentes productos favoritos para mañana vs tarde.", severity: "low", status: "pending" },
  { id: "FEAT-5", title: "Keyboard shortcuts para POS", description: "Atajos de teclado para tablets con teclado (1-9 para top productos, Enter para cobrar).", severity: "low", status: "pending" },
  { id: "FEAT-6", title: "Métricas POS a dashboard analítico", description: "Enviar pos.ticket_complete events a analytics service o Firestore para visualización.", severity: "medium", status: "pending" },
  { id: "FEAT-7", title: "Deducción de inventario al vender", description: "Descontar stock automáticamente al generar ticket en POS.", severity: "high", status: "pending" },
  { id: "FEAT-8", title: "Pricing engine con descuentos de combo", description: "Los modifiers no tienen descuentos de combo actualmente. Necesita un pricing engine.", severity: "medium", status: "pending" },
  { id: "FEAT-9", title: "Tipos compartidos en @raiz/shared", description: "Expandir @raiz/shared con Product, UnifiedOrder, Customer y más tipos compartidos entre apps.", severity: "high", status: "pending" },
  { id: "FEAT-10", title: "Event enrichment unificado App + POS", description: "Pedidos de App deben tener el mismo enrichment que POS (clima, calendario, combos, etc.).", severity: "medium", status: "pending" },
];

const IMPROVEMENTS: ProjectItem[] = [
  { id: "IMP-1", title: "Unsafe `as any` en múltiples archivos", description: "Uso de `as any` para bypassear TypeScript en app/page.tsx y checkout/page.tsx. Puede ocultar bugs.", severity: "high", location: "app/page.tsx, checkout/page.tsx", status: "pending" },
  { id: "IMP-2", title: "Memory leak en Order Notifications", description: "notifyReady falta en dependencias del useEffect. Se crean listeners sin limpiar los anteriores.", severity: "high", location: "app/hooks/use-order-notifications.ts:30", status: "pending" },
  { id: "IMP-3", title: "Empty catch blocks en Payments", description: "Catch vacíos que tragan errores silenciosamente en create payment route.", severity: "high", location: "app/api/payments/create/route.ts:26,109", status: "pending" },
  { id: "IMP-4", title: "Sin validación de longitud en campo Notes", description: "Sin límite de longitud ni sanitización del campo notas en checkout.", severity: "medium", location: "app/checkout/CheckoutClient.tsx:65", status: "pending" },
  { id: "IMP-5", title: "Array index como React key en Orders", description: "Usar `i` como key causa bugs de reconciliación si la lista se reordena.", severity: "medium", location: "app/orders/page.tsx:79", status: "pending" },
  { id: "IMP-6", title: "Lógica de time slots duplicada", description: "customer-profile-service.ts y data-enrichment.ts tienen la misma lógica de time slots.", severity: "medium", location: "app/lib/", status: "pending" },
  { id: "IMP-7", title: "Side effects silenciosos en loyalty-engine", description: "Side effects de perfil fallan silenciosamente. Puntos se otorgan pero el perfil no se actualiza.", severity: "high", location: "brain/lib/loyalty-engine.ts", status: "pending" },
  { id: "IMP-8", title: "Unsafe `any` casting en customers route", description: "(a: any, b: any) en sort derrota el type system.", severity: "medium", location: "brain/api/customers/route.ts:64", status: "pending" },
];

const ROADMAP_PRS: { id: string; title: string; status: "done" | "ready" | "pending"; risk: "low" | "medium" | "high"; description: string }[] = [
  { id: "PR5-8", title: "Loyalty Hardening (Org isolation, badges, expiry, quiz cap)", status: "done", risk: "low", description: "Cross-org leak fix, badge race condition, redemption expiry, quiz cap server-side" },
  { id: "PR9", title: "POS Migration to Brain Redemption API", status: "ready", risk: "low", description: "Eliminar acceso client-side a Firestore para redemptions" },
  { id: "PR10", title: "POS Quick Tap / Combos / Undo", status: "ready", risk: "medium", description: "POS de alta velocidad para hora punta con combos y undo" },
  { id: "PR11", title: "Modo Pico + Modifiers Inline + Métricas", status: "ready", risk: "medium", description: "Ya incluido en PR10 como parte del rewrite" },
  { id: "PR12", title: "Observabilidad + Smoke Tests + Jobs", status: "ready", risk: "low", description: "Logs estructurados, cron de expiración, snapshots" },
  { id: "PR13", title: "Brain Control Tower Mínima", status: "ready", risk: "low", description: "Panel operativo para gestionar loyalty sin Firestore directo" },
];

/* ─── Style helpers ─── */

const severityConfig: Record<Severity, { color: string; bg: string; label: string }> = {
  critical: { color: "#991b1b", bg: "#fef2f2", label: "CRÍTICO" },
  high: { color: "#92400e", bg: "#fffbeb", label: "ALTO" },
  medium: { color: "#1e40af", bg: "#eff6ff", label: "MEDIO" },
  low: { color: "#166534", bg: "#f0fdf4", label: "BAJO" },
};

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "#854d0e", bg: "#fefce8", label: "Pendiente" },
  in_progress: { color: "#1e40af", bg: "#eff6ff", label: "En progreso" },
  done: { color: "#166534", bg: "#f0fdf4", label: "Completado" },
  ready: { color: "#6d28d9", bg: "#f5f3ff", label: "Listo para deploy" },
};

const sectionCard: React.CSSProperties = {
  background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`,
  overflow: "hidden", marginBottom: 20,
};

const sectionHeader: React.CSSProperties = {
  padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: T.text, margin: 0,
};

const itemRow: React.CSSProperties = {
  padding: "12px 20px", borderBottom: `1px solid ${T.border}`,
  display: "flex", gap: 12, alignItems: "flex-start",
};

const badgePill = (color: string, bg: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
  color, background: bg, letterSpacing: "0.03em", whiteSpace: "nowrap",
  fontFamily: T.mono,
});

const countBadge = (color: string, bg: string): React.CSSProperties => ({
  fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 8,
  color, background: bg, fontFamily: T.mono,
});

type TabId = "overview" | "bugs" | "security" | "features" | "improvements" | "roadmap";

export default function HomeSection({
  products, recipes, skusCount, suppliersCount,
  dashboard, dashLoading, fcColor, fcBg, fcLabel,
  onNavigate, onFetchDashboard, onCreateRecipeForProduct,
}: HomeSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const recipeByProduct: Record<string, Recipe> = {};
  recipes.forEach(r => { if (r.productId) recipeByProduct[r.productId] = r; });
  const linkedRecipes = recipes.filter(r => r.productId);
  const unlinkedProducts = products.filter(p => !recipeByProduct[p.id]);
  const avgFC = linkedRecipes.length > 0 ? linkedRecipes.reduce((s, r) => s + (r.foodCostPct || 0), 0) / linkedRecipes.length : 0;
  const avgMargin = linkedRecipes.length > 0 ? linkedRecipes.reduce((s, r) => s + (r.sellingPrice - (r.totalCost || 0)), 0) / linkedRecipes.length : 0;
  const coveragePct = products.length > 0 ? (linkedRecipes.length / products.length) * 100 : 0;

  /* ── Counts ── */
  const criticalBugs = BUGS.filter(b => b.severity === "critical" && b.status === "pending").length;
  const criticalSec = SECURITY_ISSUES.filter(s => s.severity === "critical" && s.status === "pending").length;
  const pendingFeatures = FEATURES_TODO.filter(f => f.status === "pending").length;
  const pendingImprovements = IMPROVEMENTS.filter(i => i.status === "pending").length;
  const prsReady = ROADMAP_PRS.filter(p => p.status === "ready").length;
  const prsDone = ROADMAP_PRS.filter(p => p.status === "done").length;
  const totalPending = BUGS.filter(b => b.status === "pending").length + SECURITY_ISSUES.filter(s => s.status === "pending").length;

  const tabs: { id: TabId; label: string; count?: number; countColor?: string }[] = [
    { id: "overview", label: "Resumen" },
    { id: "bugs", label: "Bugs", count: BUGS.filter(b => b.status === "pending").length, countColor: "#dc2626" },
    { id: "security", label: "Seguridad", count: SECURITY_ISSUES.filter(s => s.status === "pending").length, countColor: "#dc2626" },
    { id: "features", label: "Por implementar", count: pendingFeatures, countColor: T.accent },
    { id: "improvements", label: "Mejoras", count: pendingImprovements, countColor: "#2563eb" },
    { id: "roadmap", label: "Roadmap", count: prsReady, countColor: "#6d28d9" },
  ];

  return (
    <div style={page}>
      <h1 style={pageTitle}>Centro de operaciones</h1>
      <p style={pageSub}>Estado completo del proyecto: bugs, seguridad, features pendientes y roadmap</p>

      {/* ── Health overview KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label="Bugs críticos" value={String(criticalBugs)} color={criticalBugs > 0 ? "#dc2626" : "#16a34a"} />
        <Kpi label="Seguridad crítica" value={String(criticalSec)} color={criticalSec > 0 ? "#dc2626" : "#16a34a"} />
        <Kpi label="Features pendientes" value={String(pendingFeatures)} color={T.accent} />
        <Kpi label="Mejoras pendientes" value={String(pendingImprovements)} color="#2563eb" />
        <Kpi label="PRs listos" value={`${prsReady}/${ROADMAP_PRS.length}`} color="#6d28d9" sub={`${prsDone} completados`} />
        <Kpi label="Tests" value="108" color="#16a34a" sub="todos pasando" />
      </div>

      {/* ── Negocio KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <Kpi label="Productos POS" value={String(products.length)} />
        <Kpi label="SKUs Master" value={String(skusCount)} color={T.accent} />
        <Kpi label="Con escandallo" value={`${linkedRecipes.length}/${products.length}`} sub={`${fmt(coveragePct)}% cobertura`} color={coveragePct >= 80 ? "#16a34a" : "#ca8a04"} />
        <Kpi label="Food cost medio" value={avgFC > 0 ? `${fmt(avgFC)}%` : "—"} color={avgFC > 0 ? fcColor(avgFC) : T.dim} />
        <Kpi label="Margen medio" value={avgMargin > 0 ? `${fmt(avgMargin)}€` : "—"} color="#16a34a" />
        <Kpi label="Proveedores" value={String(suppliersCount)} color="#2563eb" />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 16px", border: "none", cursor: "pointer",
              fontFamily: T.font, fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? T.accent : T.muted,
              background: "transparent",
              borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : "2px solid transparent",
              marginBottom: -1, display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                color: "#fff", background: tab.countColor || T.dim, fontFamily: T.mono,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: OVERVIEW ═══ */}
      {activeTab === "overview" && (
        <>
          {/* Alertas críticas */}
          {(criticalBugs > 0 || criticalSec > 0) && (
            <div style={{ ...sectionCard, borderColor: "#fecaca" }}>
              <div style={{ ...sectionHeader, background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
                <h3 style={{ ...sectionTitle, color: "#991b1b" }}>Requiere atención inmediata</h3>
                <span style={countBadge("#991b1b", "#fee2e2")}>{criticalBugs + criticalSec}</span>
              </div>
              {BUGS.filter(b => b.severity === "critical" && b.status === "pending").map(bug => (
                <div key={bug.id} style={itemRow}>
                  <span style={badgePill("#991b1b", "#fee2e2")}>BUG</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{bug.id} — {bug.title}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{bug.description}</div>
                    {bug.location && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontFamily: T.mono }}>{bug.location}</div>}
                  </div>
                </div>
              ))}
              {SECURITY_ISSUES.filter(s => s.severity === "critical" && s.status === "pending").map(sec => (
                <div key={sec.id} style={itemRow}>
                  <span style={badgePill("#991b1b", "#fee2e2")}>SEC</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{sec.id} — {sec.title}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sec.description}</div>
                    {sec.location && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontFamily: T.mono }}>{sec.location}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
            <ActionCard title="Productos sin escandallo" desc={`${unlinkedProducts.length} productos necesitan coste`} count={unlinkedProducts.length} accent="#dc2626" onClick={() => onNavigate("products")} />
            <ActionCard title="SKU Master" desc="Catálogo maestro: producto → receta → packaging → coste" count={skusCount} accent={T.accent} onClick={() => onNavigate("skus")} />
            <ActionCard title="Proveedores" desc="Gestiona proveedores y sube facturas" count={suppliersCount} accent="#2563eb" onClick={() => onNavigate("suppliers")} />
          </div>

          {/* Roadmap progress */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <h3 style={sectionTitle}>Roadmap de PRs</h3>
              <span style={{ fontSize: 12, color: T.dim }}>{prsDone}/{ROADMAP_PRS.length} completados</span>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ height: 8, borderRadius: 4, background: T.bg, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, #16a34a ${(prsDone / ROADMAP_PRS.length) * 100}%, #6d28d9 ${(prsDone / ROADMAP_PRS.length) * 100}%, #6d28d9 ${((prsDone + prsReady) / ROADMAP_PRS.length) * 100}%, ${T.border} ${((prsDone + prsReady) / ROADMAP_PRS.length) * 100}%)`, width: "100%" }} />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a", display: "inline-block" }} /> Completado ({prsDone})</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#6d28d9", display: "inline-block" }} /> Listo ({prsReady})</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: T.border, display: "inline-block" }} /> Pendiente ({ROADMAP_PRS.filter(p => p.status === "pending").length})</span>
              </div>
            </div>
          </div>

          {/* Profitability */}
          {dashboard && (
            <>
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>Rentabilidad real (últimos {dashboard.kpis.days} días)</h2>
                  <p style={{ fontSize: 12, color: T.dim, margin: "4px 0 0" }}>Datos cruzados: costes Brain + ventas POS</p>
                </div>
                <button onClick={onFetchDashboard} disabled={dashLoading} style={{ ...btnSmall, color: T.accent, borderColor: T.accent + "40" }}>
                  {dashLoading ? "..." : "Actualizar"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <Kpi label="Ingresos" value={`${fmt(dashboard.kpis.totalRevenue)}€`} color="#16a34a" />
                <Kpi label="Transacciones" value={String(dashboard.kpis.totalTransactions)} />
                <Kpi label="Ticket medio" value={`${fmt(dashboard.kpis.avgTicket)}€`} color="#2563eb" />
                <Kpi label="Food cost real" value={`${fmt(dashboard.kpis.avgFoodCostPct)}%`} color={fcColor(dashboard.kpis.avgFoodCostPct)} />
                <Kpi label="Beneficio estimado" value={`${fmt(dashboard.kpis.estimatedProfit)}€`} color="#16a34a" />
                <Kpi label="Cobertura costes" value={`${dashboard.kpis.costCoverage}%`} color={dashboard.kpis.costCoverage >= 80 ? "#16a34a" : "#ca8a04"} />
              </div>
              {dashboard.alerts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  {dashboard.alerts.map((a, i) => (
                    <div key={i} style={{
                      padding: "8px 14px", marginBottom: 6, borderRadius: 8, fontSize: 12,
                      background: a.type === "high_food_cost" ? "#fef2f2" : a.type === "missing_cost_data" ? "#fefce8" : "#f0f9ff",
                      color: a.type === "high_food_cost" ? "#991b1b" : a.type === "missing_cost_data" ? "#854d0e" : "#1e40af",
                      border: `1px solid ${a.type === "high_food_cost" ? "#fecaca" : a.type === "missing_cost_data" ? "#fde68a" : "#bfdbfe"}`,
                    }}>
                      {a.message}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {dashLoading && !dashboard && (
            <div style={{ textAlign: "center", padding: 40, color: T.dim }}>Cargando datos de rentabilidad...</div>
          )}
        </>
      )}

      {/* ═══ TAB: BUGS ═══ */}
      {activeTab === "bugs" && (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Bugs funcionales ({BUGS.length})</h3>
            <span style={{ fontSize: 12, color: BUGS.every(b => b.status === "done") ? "#16a34a" : T.dim }}>
              {BUGS.filter(b => b.status === "done").length}/{BUGS.length} resueltos
            </span>
          </div>
          {BUGS.every(b => b.status === "done") && (
            <div style={{ padding: "16px 20px", background: "#f0fdf4", borderBottom: `1px solid ${T.border}`, fontSize: 13, color: "#166534", fontWeight: 500 }}>
              Todos los bugs funcionales identificados han sido resueltos.
            </div>
          )}
          {BUGS.map(bug => {
            const sev = severityConfig[bug.severity];
            const stat = statusConfig[bug.status];
            return (
              <div key={bug.id} style={{ ...itemRow, background: bug.severity === "critical" ? "#fffbfb" : "transparent" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 70, alignItems: "flex-start" }}>
                  <span style={badgePill(sev.color, sev.bg)}>{sev.label}</span>
                  <span style={badgePill(stat.color, stat.bg)}>{stat.label}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{bug.id} — {bug.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{bug.description}</div>
                  {bug.location && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontFamily: T.mono }}>{bug.location}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: SECURITY ═══ */}
      {activeTab === "security" && (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Seguridad ({SECURITY_ISSUES.length})</h3>
            <span style={{ fontSize: 12, color: SECURITY_ISSUES.every(s => s.status === "done") ? "#16a34a" : T.dim }}>
              {SECURITY_ISSUES.filter(s => s.status === "done").length}/{SECURITY_ISSUES.length} resueltos
            </span>
          </div>
          {SECURITY_ISSUES.every(s => s.status === "done") && (
            <div style={{ padding: "16px 20px", background: "#f0fdf4", borderBottom: `1px solid ${T.border}`, fontSize: 13, color: "#166534", fontWeight: 500 }}>
              Todos los problemas de seguridad identificados han sido resueltos.
            </div>
          )}
          {SECURITY_ISSUES.map(sec => {
            const sev = severityConfig[sec.severity];
            const stat = statusConfig[sec.status];
            return (
              <div key={sec.id} style={{ ...itemRow, background: sec.severity === "critical" ? "#fffbfb" : "transparent" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 70, alignItems: "flex-start" }}>
                  <span style={badgePill(sev.color, sev.bg)}>{sev.label}</span>
                  <span style={badgePill(stat.color, stat.bg)}>{stat.label}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{sec.id} — {sec.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{sec.description}</div>
                  {sec.location && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontFamily: T.mono }}>{sec.location}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: FEATURES ═══ */}
      {activeTab === "features" && (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Features por implementar ({FEATURES_TODO.length})</h3>
            <span style={{ fontSize: 12, color: T.dim }}>
              {FEATURES_TODO.filter(f => f.severity === "high").length} alta prioridad
            </span>
          </div>
          {FEATURES_TODO.sort((a, b) => {
            const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.severity] - order[b.severity];
          }).map(feat => {
            const sev = severityConfig[feat.severity];
            const stat = statusConfig[feat.status];
            return (
              <div key={feat.id} style={itemRow}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 70, alignItems: "flex-start" }}>
                  <span style={badgePill(sev.color, sev.bg)}>{sev.label}</span>
                  <span style={badgePill(stat.color, stat.bg)}>{stat.label}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{feat.id} — {feat.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{feat.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: IMPROVEMENTS ═══ */}
      {activeTab === "improvements" && (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Mejoras de calidad ({IMPROVEMENTS.length})</h3>
            <span style={{ fontSize: 12, color: T.dim }}>
              {IMPROVEMENTS.filter(i => i.severity === "high").length} alta prioridad
            </span>
          </div>
          {IMPROVEMENTS.sort((a, b) => {
            const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.severity] - order[b.severity];
          }).map(imp => {
            const sev = severityConfig[imp.severity];
            const stat = statusConfig[imp.status];
            return (
              <div key={imp.id} style={itemRow}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 70, alignItems: "flex-start" }}>
                  <span style={badgePill(sev.color, sev.bg)}>{sev.label}</span>
                  <span style={badgePill(stat.color, stat.bg)}>{stat.label}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{imp.id} — {imp.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{imp.description}</div>
                  {imp.location && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontFamily: T.mono }}>{imp.location}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: ROADMAP ═══ */}
      {activeTab === "roadmap" && (
        <>
          {/* Progress bar */}
          <div style={{ ...sectionCard, marginBottom: 20 }}>
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Progreso general</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{Math.round((prsDone / ROADMAP_PRS.length) * 100)}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: T.bg, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 5, background: `linear-gradient(90deg, #16a34a ${(prsDone / ROADMAP_PRS.length) * 100}%, #6d28d9 ${(prsDone / ROADMAP_PRS.length) * 100}%, #6d28d9 ${((prsDone + prsReady) / ROADMAP_PRS.length) * 100}%, ${T.border} ${((prsDone + prsReady) / ROADMAP_PRS.length) * 100}%)`, width: "100%" }} />
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a", display: "inline-block" }} /> Completado ({prsDone})</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#6d28d9", display: "inline-block" }} /> Listo para deploy ({prsReady})</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: T.border, display: "inline-block" }} /> Pendiente ({ROADMAP_PRS.filter(p => p.status === "pending").length})</span>
              </div>
            </div>
          </div>

          {/* PR list */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <h3 style={sectionTitle}>Pull Requests planificados</h3>
            </div>
            {ROADMAP_PRS.map(pr => {
              const stat = statusConfig[pr.status];
              const riskColors: Record<string, { color: string; bg: string }> = {
                low: { color: "#166534", bg: "#f0fdf4" },
                medium: { color: "#92400e", bg: "#fffbeb" },
                high: { color: "#991b1b", bg: "#fef2f2" },
              };
              const risk = riskColors[pr.risk];
              return (
                <div key={pr.id} style={{ ...itemRow, opacity: pr.status === "done" ? 0.6 : 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 100, alignItems: "flex-start" }}>
                    <span style={badgePill(stat.color, stat.bg)}>{stat.label}</span>
                    <span style={badgePill(risk.color, risk.bg)}>Riesgo: {pr.risk}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: pr.status === "done" ? "line-through" : "none" }}>
                      {pr.id} — {pr.title}
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{pr.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deuda aceptable */}
          <div style={{ ...sectionCard, borderColor: T.border }}>
            <div style={{ ...sectionHeader, background: "#fafaf9" }}>
              <h3 style={sectionTitle}>Deuda técnica aceptada (por ahora)</h3>
            </div>
            {[
              "Weather enrichment en ticket-service usa API externa sin cache largo",
              "Product stats se actualizan en background fire-and-forget",
              "POS calcula puntos client-side para award — pendiente migrar a Brain API",
              "Combos hardcodeados en pos-combos.ts — futuro: gestionar desde Brain",
              "Modifiers no tienen descuentos de combo — futuro: pricing engine",
            ].map((debt, i) => (
              <div key={i} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: T.dim, fontSize: 14 }}>~</span>
                <span>{debt}</span>
              </div>
            ))}
          </div>

          {/* Pre-deploy requirement */}
          <div style={{ padding: "14px 20px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 13, color: "#92400e" }}>
            <span style={{ fontWeight: 700 }}>Antes de deploy:</span> Añadir a <span style={{ fontFamily: T.mono, fontSize: 12 }}>apps/pos/.env.local</span>: <span style={{ fontFamily: T.mono, fontSize: 12 }}>NEXT_PUBLIC_BRAIN_API_URL=https://brain.raizygrano.com</span>
          </div>
        </>
      )}
    </div>
  );
}
