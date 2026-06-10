"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { T, tableWrap, btnPrimary, btnSmall, input, fmt } from "../theme";
import type { User } from "firebase/auth";
import { trackActivation } from "@/lib/track-activation";
import { computeProfitabilityInsights, type Insight } from "@/lib/profitability/insights";

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
    /** Productos cuyo margen usa el coste aproximado ("coste rápido"). */
    estimatedCosts?: { count: number; names: string[] };
    pos?: {
      revenue: number; unitsSold: number;
      missingEscandallo: {
        count: number; names: string[]; revenue: number;
        products?: Array<{ productId: string; name: string; unitsSold: number; revenue: number; linkedRecipeId: string | null }>;
      };
    } | null;
  };
};

type Props = {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
  variant?: "margins" | "hub";
};

/**
 * Deep-link del checklist ("Puesta a punto"): baja al Resumen Y abre el panel
 * de vinculación TPV ↔ escandallo sin el clic intermedio en el insight. No hay
 * elemento con este id: el scroll lo hace el efecto de abajo, no el navegador.
 */
export const RESUMEN_VINCULAR_HASH = "#resumen-rentabilidad:vincular";

const SEMAFORO_COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#ca8a04", rojo: "#dc2626" };

export default function ProfitabilitySummary({ user, orgId, authedFetch, variant = "margins" }: Props) {
  const hub = variant === "hub";
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const seenTracked = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const hashApplied = useRef(false);

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

  // Deep-link RESUMEN_VINCULAR_HASH: al cargar con el hash (o al cambiar a él
  // vía clic en la checklist) baja al Resumen y abre el panel de vinculación —
  // pero solo si de verdad hay productos del TPV sin coste; con un hash viejo
  // y nada que vincular se limita al scroll (nunca un panel vacío). Solo LEE
  // el hash, nunca lo escribe → no puede haber loops con hashchange. El ref
  // hashApplied evita re-scroll/re-apertura en cada recarga de `data` (p. ej.
  // tras vincular un producto) y se rearma si el usuario navega a otro hash.
  useEffect(() => {
    if (!data) return;
    const apply = () => {
      if (window.location.hash !== RESUMEN_VINCULAR_HASH) {
        hashApplied.current = false;
        return;
      }
      if (hashApplied.current) return;
      hashApplied.current = true;
      const m = data.margin.source === "pos" ? data.margin.pos?.missingEscandallo : null;
      if (m && m.count > 0) setLinkOpen(true);
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [data]);

  // Se monta en silencio: si falla, el resto de Márgenes sigue dando contexto.
  if (loading || !data) return null;

  const { cash, margin } = data;
  const source = margin.source ?? (margin.hasSales ? "manual" : margin.hasRecipes ? "estimate" : "none");
  const missing = source === "pos" ? margin.pos?.missingEscandallo : null;

  // Diagnóstico "Lectura rápida": reglas puras y trazables sobre el payload
  // que ya tenemos — sin recalcular nada (lib/profitability/insights).
  const insights = computeProfitabilityInsights({ cash, margin, period: data.period });

  const SOURCE_CHIP: Record<string, { label: string; bg: string; color: string } | undefined> = {
    pos: { label: "Ventas reales del TPV", bg: "#dcfce7", color: "#15803d" },
    manual: { label: "Ventas manuales", bg: "#fef9c3", color: "#a16207" },
    estimate: { label: "Estimación por escandallo", bg: "#e0e7ff", color: "#4338ca" },
  };
  const chip = SOURCE_CHIP[source];

  return (
    <section ref={sectionRef} style={{ ...tableWrap, padding: 24, ...(hub ? { marginTop: 32 } : { marginBottom: 28 }), background: T.accent14, borderColor: T.accent40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 4px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Resumen de rentabilidad del mes</h2>
        {chip && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: chip.bg, color: chip.color }}>
            {chip.label}
          </span>
        )}
        {(margin.estimatedCosts?.count ?? 0) > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#fef3c7", color: "#92400e" }}>
            Margen con costes estimados
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

      {insights.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Lectura rápida</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {insights.map((ins) => (
              <InsightRow
                key={ins.id}
                insight={ins}
                hub={hub}
                onCta={(action) => {
                  if (action === "link-products") setLinkOpen((v) => !v);
                  else if (action === "recipes") trackActivation(user, orgId, "cta_recipes_clicked", variant);
                  else if (action === "manual-sales") trackActivation(user, orgId, "cta_manual_sales_clicked", variant);
                  else if (action === "treasury") trackActivation(user, orgId, "cta_upload_statement_clicked", variant);
                }}
                orgId={orgId}
                linkOpen={linkOpen}
              >
                {ins.id === "missing-escandallos" && linkOpen && (
                  <LinkMissingProducts
                    user={user}
                    orgId={orgId}
                    authedFetch={authedFetch}
                    products={missing?.products || []}
                    onChanged={load}
                  />
                )}
              </InsightRow>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Lectura rápida ── */

const SEVERITY_STYLE: Record<Insight["severity"], { border: string; bg: string; title: string }> = {
  good: { border: "#86efac", bg: "#f0fdf4", title: "#15803d" },
  warning: { border: "#fde68a", bg: "#fffbeb", title: "#92400e" },
  action: { border: "#fcd34d", bg: "#fef3c7", title: "#92400e" },
  info: { border: "#e5e7eb", bg: "#fafafa", title: "#374151" },
};

/**
 * Una fila del diagnóstico: título + explicación + CTA opcional. El CTA
 * lleva SIEMPRE a un flujo ya existente: panel de vinculación (toggle),
 * Escandallos, ventas manuales o subir extracto. `children` permite anidar
 * el panel de vinculación bajo el insight prioritario.
 */
function InsightRow({ insight, hub, orgId, linkOpen, onCta, children }: {
  insight: Insight;
  hub: boolean;
  orgId: string;
  linkOpen: boolean;
  onCta: (action: NonNullable<Insight["cta"]>["action"]) => void;
  children?: ReactNode;
}) {
  const s = SEVERITY_STYLE[insight.severity];
  const cta = insight.cta;
  // "manual-sales" en Márgenes no necesita link: el formulario está abajo.
  const href = cta
    ? cta.action === "recipes" ? "/?section=recipes"
    : cta.action === "manual-sales" ? (hub ? "/?section=margins" : null)
    : cta.action === "treasury" ? `/org/${orgId}/treasury/start`
    : null
    : null;

  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: s.title }}>{insight.title}</span>
        {cta && cta.action === "link-products" && (
          <button
            onClick={() => onCta(cta.action)}
            style={{ ...btnSmall, background: "#92400e", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}
          >
            {linkOpen ? "Cerrar" : cta.label}
          </button>
        )}
        {cta && cta.action !== "link-products" && href && (
          <a
            href={href}
            onClick={() => onCta(cta.action)}
            style={{ fontSize: 12, fontWeight: 700, color: s.title, textDecoration: "underline" }}
          >
            {cta.label} →
          </a>
        )}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: T.muted, marginTop: 2 }}>{insight.body}</div>
      {children}
    </div>
  );
}

/**
 * Panel inline del aviso "vendido sin escandallo": convierte el aviso en
 * acción. Por producto del TPV: vincular a un escandallo existente (PATCH
 * recipe.productId), crear uno nuevo ya vinculado (POST con productId), o
 * dejarlo pendiente. El margen solo aparece cuando el escandallo tiene coste
 * real — aquí no se inventa nada, solo se establece el vínculo.
 */
function LinkMissingProducts({ user, orgId, authedFetch, products, onChanged }: {
  user: User;
  orgId: string;
  authedFetch: (user: User, url: string, opts?: RequestInit) => Promise<Response>;
  products: Array<{ productId: string; name: string; unitsSold: number; revenue: number; linkedRecipeId: string | null }>;
  onChanged: () => void;
}) {
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; productId?: string }>>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const parsedCost = (productId: string): number | null => {
    const raw = (costs[productId] || "").replace(",", ".").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };

  const loadRecipes = useCallback(async () => {
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/recipes`);
      if (r.ok) {
        const d = await r.json();
        setRecipes((d.recipes || []).map((x: Record<string, unknown>) => ({
          id: x.id as string,
          name: (x.productName as string) || (x.name as string) || "Receta",
          productId: (x.productId as string) || undefined,
        })));
      }
    } catch (e) { console.error("LinkMissingProducts recipes:", e); }
  }, [user, orgId, authedFetch]);

  useEffect(() => { loadRecipes(); }, [loadRecipes]);

  const unlinkedRecipes = recipes.filter((r) => !r.productId);

  const link = async (productId: string, recipeId: string) => {
    if (!recipeId || busyId) return;
    setBusyId(productId);
    setError("");
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error al vincular");
      trackActivation(user, orgId, "pos_product_linked", "summary");
      await loadRecipes();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al vincular");
    } finally {
      setBusyId(null);
    }
  };

  const createLinked = async (p: { productId: string; name: string; unitsSold: number; revenue: number }) => {
    if (busyId) return;
    setBusyId(p.productId);
    setError("");
    try {
      const sellingPrice = p.unitsSold > 0 ? Math.round((p.revenue / p.unitsSold) * 100) / 100 : 0;
      const estimatedUnitCost = parsedCost(p.productId);
      const r = await authedFetch(user, `/api/org/${orgId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          sellingPrice,
          productId: p.productId,
          ...(estimatedUnitCost ? { estimatedUnitCost } : {}),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error al crear el escandallo");
      trackActivation(user, orgId, "pos_product_linked", "summary");
      if (estimatedUnitCost) trackActivation(user, orgId, "quick_cost_added", "summary");
      await loadRecipes();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el escandallo");
    } finally {
      setBusyId(null);
    }
  };

  const saveQuickCost = async (p: { productId: string; linkedRecipeId: string | null }) => {
    const est = parsedCost(p.productId);
    if (!est || !p.linkedRecipeId || busyId) return;
    setBusyId(p.productId);
    setError("");
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/recipes/${p.linkedRecipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedUnitCost: est }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error al guardar el coste");
      trackActivation(user, orgId, "quick_cost_added", "summary");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el coste");
    } finally {
      setBusyId(null);
    }
  };

  const costInput = (productId: string) => (
    <input
      value={costs[productId] || ""}
      onChange={(e) => setCosts((c) => ({ ...c, [productId]: e.target.value }))}
      placeholder="Coste aprox. €"
      inputMode="decimal"
      style={{ ...input, padding: "6px 10px", fontSize: 12, width: 110 }}
    />
  );

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #fcd34d", paddingTop: 12 }}>
      {error && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{error}</div>}
      {products.length === 0 && (
        <div style={{ fontSize: 12 }}>No hay detalle de productos disponible. Recarga la página.</div>
      )}
      {products.map((p) => {
        const busy = busyId === p.productId;
        return (
          <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid #fde68a" }}>
            <div style={{ minWidth: 180, flex: "1 1 180px" }}>
              <div style={{ fontWeight: 700, color: "#78350f" }}>{p.name}</div>
              <div style={{ fontSize: 11 }}>{p.unitsSold} uds · {fmt(p.revenue)}€ este mes</div>
            </div>
            {p.linkedRecipeId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                <span>Escandallo vinculado, <strong>falta su coste</strong>.</span>
                {costInput(p.productId)}
                <button
                  disabled={busy || !parsedCost(p.productId)}
                  onClick={() => saveQuickCost(p)}
                  style={{ ...btnSmall, opacity: busy || !parsedCost(p.productId) ? 0.5 : 1, cursor: "pointer" }}
                >
                  {busy ? "Guardando…" : "Guardar coste aprox."}
                </button>
                <Link href="/?section=recipes" style={{ color: "#92400e", fontWeight: 700, textDecoration: "underline" }}>
                  Completar ingredientes →
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {unlinkedRecipes.length > 0 && (
                  <>
                    <select
                      value={selected[p.productId] || ""}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.productId]: e.target.value }))}
                      style={{ ...input, padding: "6px 10px", fontSize: 12, maxWidth: 190 }}
                    >
                      <option value="">Vincular a escandallo…</option>
                      {unlinkedRecipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button
                      disabled={busy || !selected[p.productId]}
                      onClick={() => link(p.productId, selected[p.productId])}
                      style={{ ...btnSmall, opacity: busy || !selected[p.productId] ? 0.5 : 1, cursor: "pointer" }}
                    >
                      Vincular
                    </button>
                  </>
                )}
                {costInput(p.productId)}
                <button
                  disabled={busy}
                  onClick={() => createLinked(p)}
                  style={{ ...btnSmall, background: "#92400e", color: "#fff", border: "none", opacity: busy ? 0.5 : 1, cursor: "pointer" }}
                >
                  {busy ? "Guardando…" : "Crear escandallo vinculado"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11, marginTop: 8 }}>
        Si pones un coste aprox., lo usaremos como coste provisional hasta que completes ingredientes (margen marcado como estimado).
        Sin ningún coste, no inventamos margen.
      </div>
    </div>
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
