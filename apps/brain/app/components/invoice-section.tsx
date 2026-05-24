"use client";

import { useState, useRef } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../lib/authed-fetch";
import { fmt, fmt4 } from "./theme";

/* ─── Types ─────────────────────────────────────────────────── */
type CatalogItem = {
  id: string; name: string; baseUnit: string; packQty: number;
  packUnit: string; packCost: number; unitCost: number; supplier: string;
};

type ExtractedItem = {
  name: string;
  qty: number;
  unit: string;
  packDescription?: string;
  unitPrice: number;
  totalPrice: number;
  // UI-added fields:
  action: "create" | "update" | "skip";
  catalogItemId?: string;
  baseUnit: string;
  packQty: number;
};

type Extraction = {
  supplier: string;
  date: string;
  invoiceNumber: string;
  items: ExtractedItem[];
  subtotal: number;
  tax: number;
  total: number;
};

/* ═══════════════════════════════════════════════════════════════ */
export default function InvoiceSection({
  user,
  catalog,
  onCatalogUpdate,
  S,
  orgId,
}: {
  user: User;
  catalog: CatalogItem[];
  onCatalogUpdate: () => void;
  S: Record<string, string>;
  orgId: string;
}) {
  const [step, setStep] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; recipesRecalculated: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Upload & Extract ──────────────────────────────────── */
  const handleUpload = async (file: File) => {
    setStep("processing");
    setFileName(file.name);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authedFetch(user, `/api/org/${orgId}/invoices/extract`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Error al procesar");
        setStep("upload");
        return;
      }

      const ext = data.extraction as Extraction;
      setExtraction(ext);

      // Auto-match items with existing catalog
      const enriched = (ext.items || []).map((item: ExtractedItem) => {
        const match = findCatalogMatch(item.name, catalog);
        return {
          ...item,
          action: match ? "update" as const : "create" as const,
          catalogItemId: match?.id,
          baseUnit: match?.baseUnit || guessBaseUnit(item.unit),
          packQty: match?.packQty || item.qty || 1,
        };
      });

      setItems(enriched);
      setStep("review");
    } catch (e) {
      setError("Error de conexión");
      setStep("upload");
    }
  };

  /* ── Apply to catalog ──────────────────────────────────── */
  const applyChanges = async () => {
    setApplying(true);
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/invoices/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: extraction?.supplier || "",
          items,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data.summary);
        setStep("done");
        onCatalogUpdate();
      } else {
        setError(data.error || "Error al aplicar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setExtraction(null);
    setItems([]);
    setResult(null);
    setError("");
  };

  /* ── Update item ───────────────────────────────────────── */
  const updateItem = (idx: number, field: string, value: unknown) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  /* ═══════════ RENDER ═══════════ */
  return (
    <div style={{ padding: "32px 36px", maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Facturas</h1>
      <p style={{ color: S.muted, fontSize: 13, margin: "0 0 28px" }}>
        Sube un PDF de factura → Claude extrae los datos → revisas → el catálogo se actualiza automáticamente
      </p>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#ef4444", fontSize: 13 }}>
          {error}
          <button onClick={() => setError("")} style={{ marginLeft: 12, background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ── STEP: Upload ── */}
      {step === "upload" && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file?.type === "application/pdf") handleUpload(file);
          }}
          style={{
            background: S.surface,
            border: `2px dashed ${S.border}`,
            borderRadius: 16,
            padding: "60px 40px",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: S.text, marginBottom: 6 }}>
            Arrastra un PDF de factura aquí
          </div>
          <div style={{ fontSize: 13, color: S.muted }}>
            o haz clic para seleccionar archivo
          </div>
          <div style={{ fontSize: 11, color: S.dim, marginTop: 16 }}>
            Claude analizará la factura y extraerá proveedor, artículos y precios
          </div>
        </div>
      )}

      {/* ── STEP: Processing ── */}
      {step === "processing" && (
        <div style={{ background: S.surface, borderRadius: 16, border: `1px solid ${S.border}`, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 16, animation: "spin 2s linear infinite" }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: S.text, marginBottom: 6 }}>
            Procesando {fileName}...
          </div>
          <div style={{ fontSize: 13, color: S.muted }}>
            Claude está leyendo la factura. Esto tarda 5-15 segundos.
          </div>
        </div>
      )}

      {/* ── STEP: Review ── */}
      {step === "review" && extraction && (
        <>
          {/* Invoice header */}
          <div style={{ background: S.surface, borderRadius: 12, border: `1px solid ${S.border}`, padding: 18, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{extraction.supplier || "Proveedor desconocido"}</div>
              <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>
                Factura: {extraction.invoiceNumber || "—"} · Fecha: {extraction.date || "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 18, fontWeight: 700 }}>{fmt(extraction.total || 0)}€</div>
              <div style={{ fontSize: 11, color: S.dim }}>
                Base: {fmt(extraction.subtotal || 0)}€ · IVA: {fmt(extraction.tax || 0)}€
              </div>
            </div>
          </div>

          {/* Items table */}
          <div style={{ background: S.surface, borderRadius: 12, border: `1px solid ${S.border}`, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {items.length} artículos detectados
              </span>
              <div style={{ fontSize: 11, color: S.muted }}>
                <span style={{ color: "#22c55e" }}>{items.filter(i => i.action === "update").length} actualizar</span>
                {" · "}
                <span style={{ color: S.accent }}>{items.filter(i => i.action === "create").length} crear</span>
                {" · "}
                <span style={{ color: S.dim }}>{items.filter(i => i.action === "skip").length} ignorar</span>
              </div>
            </div>

            {items.map((item, idx) => (
              <div key={idx} style={{ padding: "12px 16px", borderBottom: `1px solid #1a1a1a`, opacity: item.action === "skip" ? 0.4 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  {/* Left: item info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
                      {item.packDescription || `${item.qty} ${item.unit}`} · {fmt(item.unitPrice)}€/ud · Total: {fmt(item.totalPrice)}€
                    </div>

                    {/* Match info */}
                    {item.action === "update" && item.catalogItemId && (
                      <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>
                        ✓ Coincide con: {catalog.find(c => c.id === item.catalogItemId)?.name}
                      </div>
                    )}
                    {item.action === "create" && (
                      <div style={{ fontSize: 11, color: S.accent, marginTop: 4 }}>
                        + Se creará nuevo artículo en catálogo
                      </div>
                    )}
                  </div>

                  {/* Right: action + config */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    {/* Base unit */}
                    <select
                      value={item.baseUnit}
                      onChange={e => updateItem(idx, "baseUnit", e.target.value)}
                      style={{ ...selectStyle(S), width: 60 }}
                    >
                      {["g", "ml", "ud", "kg", "L"].map(u => <option key={u}>{u}</option>)}
                    </select>

                    {/* Pack qty */}
                    <input
                      type="number"
                      value={item.packQty}
                      onChange={e => updateItem(idx, "packQty", Number(e.target.value))}
                      style={{ ...inputStyle(S), width: 60, fontFamily: "'SF Mono', monospace" }}
                      title="Uds por pack"
                    />

                    {/* Computed unit cost */}
                    <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 11, color: S.accent, minWidth: 70, textAlign: "right" }}>
                      {item.packQty > 0 ? fmt4(item.unitPrice / item.packQty) : "—"}€/{item.baseUnit}
                    </div>

                    {/* Action toggle */}
                    <div style={{ display: "flex", gap: 2 }}>
                      {(["update", "create", "skip"] as const).map(a => (
                        <button
                          key={a}
                          onClick={() => updateItem(idx, "action", a)}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: `1px solid ${item.action === a ? actionColor(a) : S.border}`,
                            background: item.action === a ? `${actionColor(a)}20` : "transparent",
                            color: item.action === a ? actionColor(a) : S.dim,
                            fontSize: 10,
                            cursor: "pointer",
                            fontFamily: S.font,
                          }}
                        >
                          {a === "update" ? "Act." : a === "create" ? "Crear" : "Skip"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Catalog match selector for "update" action */}
                {item.action === "update" && (
                  <select
                    value={item.catalogItemId || ""}
                    onChange={e => updateItem(idx, "catalogItemId", e.target.value)}
                    style={{ ...selectStyle(S), width: "100%", marginTop: 8, fontSize: 12 }}
                  >
                    <option value="">— Seleccionar artículo existente —</option>
                    {catalog.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.supplier} · {fmt(c.packCost)}€/{c.packUnit} → {fmt4(c.unitCost)}€/{c.baseUnit}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={reset} style={btnSmall(S)}>← Subir otra</button>
            <button
              onClick={applyChanges}
              disabled={applying || items.every(i => i.action === "skip")}
              style={{
                ...btnAccent(S),
                opacity: applying || items.every(i => i.action === "skip") ? 0.4 : 1,
              }}
            >
              {applying ? "Aplicando..." : `Aplicar cambios (${items.filter(i => i.action !== "skip").length} artículos)`}
            </button>
          </div>
        </>
      )}

      {/* ── STEP: Done ── */}
      {step === "done" && result && (
        <div style={{ background: S.surface, borderRadius: 16, border: `1px solid ${S.border}`, padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>Factura procesada</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 500, margin: "0 auto 24px" }}>
            <MiniKpi label="Creados" value={String(result.created)} color={S.accent} />
            <MiniKpi label="Actualizados" value={String(result.updated)} color="#22c55e" />
            <MiniKpi label="Ignorados" value={String(result.skipped)} color={S.dim} />
            <MiniKpi label="Recetas recalc." value={String(result.recipesRecalculated)} color="#7ea8c8" />
          </div>

          <button onClick={reset} style={btnAccent(S)}>Subir otra factura</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* ─── Helpers ────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════ */

function findCatalogMatch(name: string, catalog: CatalogItem[]): CatalogItem | null {
  const lower = name.toLowerCase();
  // Exact match
  const exact = catalog.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact;
  // Fuzzy: check if name contains catalog item name or vice versa
  const fuzzy = catalog.find(c =>
    lower.includes(c.name.toLowerCase()) ||
    c.name.toLowerCase().includes(lower)
  );
  return fuzzy || null;
}

function guessBaseUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u.includes("kg")) return "g";
  if (u.includes("g")) return "g";
  if (u.includes("l")) return "ml";
  if (u.includes("ml")) return "ml";
  return "ud";
}

function actionColor(a: string): string {
  if (a === "update") return "#22c55e";
  if (a === "create") return "#c8a97e";
  return "#666";
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ─── Style helpers (receive S tokens) ───────────────────────── */
function inputStyle(S: Record<string, string>): React.CSSProperties {
  return { padding: "6px 10px", borderRadius: 6, border: `1px solid ${S.border}`, background: S.bg, color: S.text, fontFamily: S.font, fontSize: 12, outline: "none", boxSizing: "border-box" };
}
function selectStyle(S: Record<string, string>): React.CSSProperties {
  return { ...inputStyle(S), cursor: "pointer" };
}
function btnAccent(S: Record<string, string>): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, border: "none", background: S.accent, color: "#0a0a0a", fontFamily: S.font, fontSize: 13, fontWeight: 600, cursor: "pointer" };
}
function btnSmall(S: Record<string, string>): React.CSSProperties {
  return { padding: "6px 12px", borderRadius: 6, border: `1px solid ${S.border}`, background: "transparent", color: S.muted, fontFamily: S.font, fontSize: 12, cursor: "pointer" };
}
