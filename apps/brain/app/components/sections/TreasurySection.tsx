"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../../lib/authed-fetch";
import { T, page, pageTitle, pageSub, tbl, trHead, trBody, th, td, tdR, btnPrimary, btnSmall, btnGhost, input, fmt, badge } from "../theme";
import PanelDeVerdad from "./treasury/PanelDeVerdad";

/* ─── Types ─────────────────────────────────────────────────── */

type BankMovement = {
  id: string;
  date: string;
  concept: string;
  conceptNormalized?: string;
  amount: number;
  balance?: number;
  category?: string;
  supplierName?: string;
  type: "gasto" | "ingreso";
  status: "pending" | "categorized" | "matched";
};

type QuarterData = {
  quarter: string;
  totalExpenses: number;
  totalIncome: number;
  netFlow: number;
  totalMovements: number;
  pendingCategorization: number;
  byCategory: Array<{
    category: string;
    label: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  topSuppliers: Array<{
    supplierName: string;
    total: number;
    count: number;
  }>;
  vsPrevQuarter?: {
    expensesDelta: number;
    expensesDeltaPct: number;
  };
};

type CategorizationSuggestion = {
  movementId: string;
  suggestedCategory: string;
  suggestedSupplier?: string;
  confidence: number;
  reasoning?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  materia_prima: "Materia prima",
  packaging: "Packaging",
  servicios: "Servicios",
  alquiler: "Alquiler",
  suministros: "Suministros",
  personal: "Personal",
  impuestos: "Impuestos",
  seguros: "Seguros",
  marketing: "Marketing",
  equipamiento: "Equipamiento",
  mantenimiento: "Mantenimiento",
  bancarios: "Gastos bancarios",
  logistica: "Logística",
  otros: "Otros",
};

const CATEGORY_COLORS: Record<string, string> = {
  materia_prima: "#92400e",
  packaging: "#9333ea",
  servicios: "#1d4ed8",
  alquiler: "#0891b2",
  suministros: "#ca8a04",
  personal: "#15803d",
  impuestos: "#b91c1c",
  seguros: "#6366f1",
  marketing: "#db2777",
  equipamiento: "#0d9488",
  mantenimiento: "#78716c",
  bancarios: "#64748b",
  logistica: "#ea580c",
  otros: "#a8a29e",
};

/* ─── Helpers ───────────────────────────────────────────────── */

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

function getQuarterOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let y = currentYear; y >= currentYear - 1; y--) {
    for (let q = 4; q >= 1; q--) {
      options.push(`${y}-Q${q}`);
    }
  }
  return options;
}

/* ═══════════════════════════════════════════════════════════════ */

export default function TreasurySection({
  user,
  orgId,
}: {
  user: User;
  orgId: string;
}) {
  /* ── State ── */
  const [tab, setTab] = useState<"truth" | "overview" | "movements" | "upload">("truth");
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const [quarterData, setQuarterData] = useState<QuarterData | null>(null);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    totalMovements: number;
    totalExpenses: number;
    totalIncome: number;
    bankName?: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // PR1.3: bank/last4 explícitos para CSV que no traen metadata.
  const [uploadBank, setUploadBank] = useState<"" | "santander" | "bbva" | "other">("");
  const [uploadLast4, setUploadLast4] = useState("");

  // Categorization state
  const [categorizing, setCategorizing] = useState(false);
  const [suggestions, setSuggestions] = useState<CategorizationSuggestion[]>([]);

  // Movement filter
  const [movFilter, setMovFilter] = useState<"all" | "pending" | "gasto" | "ingreso">("all");

  /* ── Fetchers ── */
  const fetchQuarterly = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/treasury/quarterly?quarter=${quarter}`);
      const data = await res.json();
      if (data.ok) setQuarterData(data);
      else setError(data.error || "Error cargando datos trimestrales");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [user, orgId, quarter]);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      let qs = `quarter=${quarter}`;
      if (movFilter === "pending") qs += "&status=pending";
      if (movFilter === "gasto" || movFilter === "ingreso") qs += `&type=${movFilter}`;

      const res = await authedFetch(user, `/api/org/${orgId}/treasury/movements?${qs}`);
      const data = await res.json();
      if (data.ok) setMovements(data.movements || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, orgId, quarter, movFilter]);

  useEffect(() => {
    if (tab === "overview") fetchQuarterly();
    if (tab === "movements") fetchMovements();
  }, [tab, quarter, movFilter, fetchQuarterly, fetchMovements]);

  /* ── Upload handler ── */
  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", file);
    // PR1.3: si el usuario eligió banco / last4 en la UI, los mandamos
    // como override al endpoint extract.
    if (uploadBank) formData.append("bank", uploadBank);
    if (uploadLast4) formData.append("accountLast4", uploadLast4);

    try {
      const res = await authedFetch(user, `/api/org/${orgId}/treasury/extract`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Error al procesar");
        return;
      }

      setUploadResult({
        totalMovements: data.totalMovements,
        totalExpenses: data.totalExpenses,
        totalIncome: data.totalIncome,
        bankName: data.bankName,
      });
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  };

  /* ── Auto-categorize ── */
  const handleCategorize = async () => {
    setCategorizing(true);
    setSuggestions([]);
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/treasury/categorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApply: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuggestions(data.suggestions || []);
        // Refresh data
        fetchQuarterly();
        fetchMovements();
      }
    } catch {
      setError("Error al categorizar");
    } finally {
      setCategorizing(false);
    }
  };

  /* ── Manual category update ── */
  const updateMovementCategory = async (movId: string, category: string) => {
    try {
      await authedFetch(user, `/api/org/${orgId}/treasury/movements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id: movId, category }] }),
      });
      setMovements(prev =>
        prev.map(m => m.id === movId ? { ...m, category, status: "categorized" } : m)
      );
    } catch { /* silent */ }
  };

  /* ═══════════ RENDER ═══════════ */

  return (
    <div style={page}>
      <h1 style={pageTitle}>Tesorería</h1>
      <p style={pageSub}>Extractos bancarios, gastos por categoría y vista trimestral</p>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["truth", "overview", "movements", "upload"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${tab === t ? T.accent : T.border}`,
              background: tab === t ? T.accentLight : T.surface,
              color: tab === t ? T.accent : T.muted,
              fontWeight: tab === t ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            {t === "truth" ? "Panel de Verdad" : t === "overview" ? "Vista trimestral" : t === "movements" ? "Movimientos" : "Subir extracto"}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: "12px 16px", marginBottom: 16, borderRadius: 10,
          background: T.dangerBg, color: T.danger, fontSize: 13, border: `1px solid ${T.danger}20`,
        }}>
          {error}
          <button onClick={() => setError("")} style={{ marginLeft: 12, background: "none", border: "none", color: T.danger, cursor: "pointer", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* ════════════ PANEL DE VERDAD (PR7) ════════════ */}
      {tab === "truth" && <PanelDeVerdad user={user} orgId={orgId} />}

      {/* ════════════ OVERVIEW TAB ════════════ */}
      {tab === "overview" && (
        <div>
          {/* Quarter selector */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            <select
              value={quarter}
              onChange={e => setQuarter(e.target.value)}
              style={{
                ...input, width: 160, padding: "8px 12px",
                background: T.surface, borderRadius: 8,
              }}
            >
              {getQuarterOptions().map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
            {quarterData && quarterData.pendingCategorization > 0 && (
              <button
                onClick={handleCategorize}
                disabled={categorizing}
                style={{
                  ...btnPrimary,
                  opacity: categorizing ? 0.6 : 1,
                  fontSize: 12,
                  padding: "8px 16px",
                }}
              >
                {categorizing ? "Categorizando..." : `Auto-categorizar (${quarterData.pendingCategorization} pendientes)`}
              </button>
            )}
          </div>

          {loading && <p style={{ color: T.muted, fontSize: 14 }}>Cargando datos trimestrales...</p>}

          {quarterData && !loading && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                <KpiCard label="Gastos totales" value={`${fmt(quarterData.totalExpenses)}`} color={T.danger} />
                <KpiCard label="Ingresos" value={`${fmt(quarterData.totalIncome)}`} color={T.success} />
                <KpiCard
                  label="Flujo neto"
                  value={`${fmt(quarterData.netFlow)}`}
                  color={quarterData.netFlow >= 0 ? T.success : T.danger}
                />
                <KpiCard
                  label="Movimientos"
                  value={String(quarterData.totalMovements)}
                  sub={quarterData.pendingCategorization > 0 ? `${quarterData.pendingCategorization} sin categorizar` : "Todo categorizado"}
                />
              </div>

              {/* Prev quarter comparison */}
              {quarterData.vsPrevQuarter && (
                <div style={{
                  padding: "12px 16px", marginBottom: 20, borderRadius: 10, fontSize: 13,
                  background: quarterData.vsPrevQuarter.expensesDelta > 0 ? T.warningBg : T.successBg,
                  color: quarterData.vsPrevQuarter.expensesDelta > 0 ? T.warning : T.success,
                  border: `1px solid ${quarterData.vsPrevQuarter.expensesDelta > 0 ? T.warning : T.success}20`,
                }}>
                  vs trimestre anterior: {quarterData.vsPrevQuarter.expensesDelta > 0 ? "+" : ""}{fmt(quarterData.vsPrevQuarter.expensesDelta)} ({quarterData.vsPrevQuarter.expensesDeltaPct > 0 ? "+" : ""}{quarterData.vsPrevQuarter.expensesDeltaPct}%)
                </div>
              )}

              {/* Category breakdown */}
              {quarterData.byCategory.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: T.text }}>Gastos por categoría</h3>
                  <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <table style={tbl}>
                      <thead>
                        <tr style={trHead}>
                          <th style={th}>Categoría</th>
                          <th style={{ ...th, textAlign: "right" }}>Total</th>
                          <th style={{ ...th, textAlign: "right" }}>Movimientos</th>
                          <th style={{ ...th, textAlign: "right" }}>% del gasto</th>
                          <th style={th}>Distribución</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quarterData.byCategory.map(cat => (
                          <tr key={cat.category} style={trBody}>
                            <td style={td}>
                              <span style={{
                                display: "inline-block", width: 10, height: 10, borderRadius: 3,
                                background: CATEGORY_COLORS[cat.category] || T.dim,
                                marginRight: 8, verticalAlign: "middle",
                              }} />
                              {cat.label}
                            </td>
                            <td style={tdR}>{fmt(cat.total)}</td>
                            <td style={{ ...tdR, color: T.muted }}>{cat.count}</td>
                            <td style={tdR}>{cat.percentage}%</td>
                            <td style={{ ...td, width: 140 }}>
                              <div style={{
                                height: 6, borderRadius: 3, background: T.bg,
                                overflow: "hidden",
                              }}>
                                <div style={{
                                  height: "100%",
                                  width: `${Math.min(cat.percentage, 100)}%`,
                                  background: CATEGORY_COLORS[cat.category] || T.accent,
                                  borderRadius: 3,
                                }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top suppliers */}
              {quarterData.topSuppliers.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: T.text }}>Top proveedores</h3>
                  <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <table style={tbl}>
                      <thead>
                        <tr style={trHead}>
                          <th style={th}>#</th>
                          <th style={th}>Proveedor</th>
                          <th style={{ ...th, textAlign: "right" }}>Total gastado</th>
                          <th style={{ ...th, textAlign: "right" }}>Operaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quarterData.topSuppliers.map((s, i) => (
                          <tr key={i} style={trBody}>
                            <td style={{ ...td, color: T.dim, fontFamily: T.mono, fontSize: 12 }}>{i + 1}</td>
                            <td style={{ ...td, fontWeight: 500 }}>{s.supplierName}</td>
                            <td style={tdR}>{fmt(s.total)}</td>
                            <td style={{ ...tdR, color: T.muted }}>{s.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {quarterData.totalMovements === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: T.muted }}>
                  <p style={{ fontSize: 36, marginBottom: 12 }}>📊</p>
                  <p style={{ fontSize: 15, fontWeight: 500 }}>Sin movimientos en {quarter}</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>Sube un extracto bancario para empezar</p>
                  <button onClick={() => setTab("upload")} style={{ ...btnPrimary, marginTop: 16, fontSize: 13 }}>
                    Subir extracto
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════ MOVEMENTS TAB ════════════ */}
      {tab === "movements" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <select
              value={quarter}
              onChange={e => setQuarter(e.target.value)}
              style={{ ...input, width: 140, padding: "7px 10px", borderRadius: 8 }}
            >
              {getQuarterOptions().map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
            {(["all", "pending", "gasto", "ingreso"] as const).map(f => (
              <button
                key={f}
                onClick={() => setMovFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `1px solid ${movFilter === f ? T.accent : T.border}`,
                  background: movFilter === f ? T.accentLight : "transparent",
                  color: movFilter === f ? T.accent : T.muted,
                  fontSize: 12,
                  fontWeight: movFilter === f ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: T.font,
                }}
              >
                {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "gasto" ? "Gastos" : "Ingresos"}
              </button>
            ))}
          </div>

          {loading && <p style={{ color: T.muted, fontSize: 14 }}>Cargando movimientos...</p>}

          {!loading && movements.length > 0 && (
            <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <table style={tbl}>
                <thead>
                  <tr style={trHead}>
                    <th style={th}>Fecha</th>
                    <th style={th}>Concepto</th>
                    <th style={th}>Categoría</th>
                    <th style={th}>Proveedor</th>
                    <th style={{ ...th, textAlign: "right" }}>Importe</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} style={trBody}>
                      <td style={{ ...td, fontSize: 12, fontFamily: T.mono, color: T.muted, whiteSpace: "nowrap" }}>
                        {m.date}
                      </td>
                      <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span title={m.concept}>{m.conceptNormalized || m.concept}</span>
                      </td>
                      <td style={{ ...td, minWidth: 120 }}>
                        <select
                          value={m.category || ""}
                          onChange={e => updateMovementCategory(m.id, e.target.value)}
                          style={{
                            fontSize: 11, padding: "3px 6px", borderRadius: 6,
                            border: `1px solid ${T.border}`, background: T.bg,
                            color: m.category ? CATEGORY_COLORS[m.category] || T.text : T.dim,
                            fontWeight: m.category ? 500 : 400,
                            fontFamily: T.font, cursor: "pointer",
                          }}
                        >
                          <option value="">Sin categoría</option>
                          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...td, fontSize: 13, color: T.muted }}>
                        {m.supplierName || "—"}
                      </td>
                      <td style={{
                        ...tdR,
                        color: m.amount < 0 ? T.danger : T.success,
                        fontWeight: 600,
                      }}>
                        {m.amount < 0 ? "-" : "+"}{fmt(Math.abs(m.amount))}
                      </td>
                      <td style={td}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "3px 8px",
                          borderRadius: 6, fontFamily: T.mono,
                          background: m.status === "matched" ? T.successBg
                            : m.status === "categorized" ? T.infoBg
                            : T.warningBg,
                          color: m.status === "matched" ? T.success
                            : m.status === "categorized" ? T.info
                            : T.warning,
                        }}>
                          {m.status === "matched" ? "vinculado" : m.status === "categorized" ? "categorizado" : "pendiente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && movements.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: T.muted }}>
              <p style={{ fontSize: 15 }}>No hay movimientos para este filtro</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════ UPLOAD TAB ════════════ */}
      {tab === "upload" && (
        <div>
          {/* PR1.3: selector banco / last4 antes del drop */}
          <div style={{
            display: "flex", gap: 12, marginBottom: 16, alignItems: "center",
            padding: "12px 16px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>
              Antes de subir, indica banco y últimos 4 (opcional pero recomendado para CSV):
            </div>
            <select
              value={uploadBank}
              onChange={e => setUploadBank(e.target.value as typeof uploadBank)}
              style={{ ...input, width: 130, padding: "6px 10px", borderRadius: 6 }}
            >
              <option value="">Auto-detectar</option>
              <option value="santander">Santander</option>
              <option value="bbva">BBVA</option>
              <option value="other">Otro</option>
            </select>
            <input
              type="text"
              placeholder="Últ. 4 (opcional)"
              maxLength={4}
              value={uploadLast4}
              onChange={e => setUploadLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              style={{ ...input, width: 130, padding: "6px 10px", borderRadius: 6 }}
            />
            {uploadBank && (
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>
                → accountId: {uploadBank}_{uploadLast4 || "main"}
              </span>
            )}
          </div>

          <div style={{
            background: T.surface,
            border: `2px dashed ${T.border}`,
            borderRadius: 16,
            padding: "48px 32px",
            textAlign: "center",
            cursor: uploading ? "wait" : "pointer",
            transition: "all 0.2s",
          }}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file) handleUpload(file);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />

            {uploading ? (
              <>
                <p style={{ fontSize: 40, marginBottom: 12 }}>⏳</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Procesando extracto...</p>
                <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Extrayendo movimientos con IA. Esto puede tardar unos segundos.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 40, marginBottom: 12 }}>📄</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Sube un extracto bancario</p>
                <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  PDF, CSV o Excel — Arrastra aquí o haz clic para seleccionar
                </p>
                <p style={{ fontSize: 11, color: T.dim, marginTop: 12 }}>
                  Los PDFs se procesan con IA · Los CSVs se parsean automáticamente
                </p>
              </>
            )}
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div style={{
              marginTop: 20,
              padding: "20px 24px",
              background: T.successBg,
              borderRadius: 12,
              border: `1px solid ${T.success}20`,
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.success, margin: "0 0 12px" }}>
                Extracto procesado correctamente
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Movimientos</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.mono }}>{uploadResult.totalMovements}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Total gastos</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.mono, color: T.danger }}>{fmt(uploadResult.totalExpenses)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>Total ingresos</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.mono, color: T.success }}>{fmt(uploadResult.totalIncome)}</div>
                </div>
              </div>
              {uploadResult.bankName && (
                <p style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>Banco detectado: {uploadResult.bankName}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => { setTab("movements"); setUploadResult(null); }}
                  style={{ ...btnPrimary, fontSize: 12, padding: "8px 16px" }}
                >
                  Ver movimientos
                </button>
                <button
                  onClick={handleCategorize}
                  disabled={categorizing}
                  style={{ ...btnGhost, fontSize: 12, padding: "8px 16px" }}
                >
                  {categorizing ? "Categorizando..." : "Auto-categorizar con IA"}
                </button>
              </div>
            </div>
          )}

          {/* Categorization results */}
          {suggestions.length > 0 && (
            <div style={{
              marginTop: 16, padding: "16px 20px", background: T.infoBg,
              borderRadius: 12, border: `1px solid ${T.info}20`,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.info, margin: "0 0 8px" }}>
                Categorización completada
              </h3>
              <p style={{ fontSize: 13, color: T.muted }}>
                {suggestions.filter(s => s.confidence >= 0.8).length} movimientos auto-categorizados ·{" "}
                {suggestions.filter(s => s.confidence < 0.8).length} requieren revisión manual
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── KpiCard sub-component ─────────────────────────────────── */

function KpiCard({ label, value, color, sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.mono, color: color || T.text, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
