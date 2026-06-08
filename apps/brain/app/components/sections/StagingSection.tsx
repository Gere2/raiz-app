"use client";

/**
 * StagingSection — cola de trabajo de facturas del pipeline singularidad-engine.
 *
 * Extiende la interfaz existente (reusa theme/table/badge/btn* de ../theme).
 * Todas las acciones delegan en /api/staging/* que a su vez proxya al
 * adaptador HTTP Python (brain/invoices/httpapi.py). No hay lógica de
 * matching ni de sync duplicada aquí.
 */
import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../../lib/authed-fetch";
import {
  T, pageTitle, pageSub, tableWrap, tbl, trHead, trBody, th, td, tdR,
  btnPrimary, btnSmall, btnGhost, badge, kpiBox, kpiLbl, kpiVal, fmt,
} from "../theme";

/* ─── Types (flattened from the staging API) ─────────────────── */

type Doc = {
  id: string;
  status: string;                    // inbound_documents.status
  received_at: string;
  source: string;
  source_ref?: string;
  subject?: string;
  supplier_name?: string;
  supplier_tax_id?: string;
  invoice_number?: string;
  issue_date?: string;
  total?: number;
  currency?: string;
  // sync
  remote_supplier_id?: string;
  remote_invoice_id?: string;
  sync_path?: string;
  sync_status?: string;
  synced_at?: string;
  // reconciliation
  match_status?: string;
  confidence?: number;
  remote_movement_id?: string;
  amount_delta?: number;
  date_delta_days?: number;
  human_confirmed?: number;
  backlink_written?: number;
};

type Candidate = {
  movement_id: string;
  score: number;
  reasons: string[];
  amount_delta: number | null;
  date_delta_days: number | null;
  movement_date?: string;
  movement_amount?: number;
  movement_concept?: string;
  movement_status?: string;
  movement_category?: string;
  movement_invoice_ref?: string | null;
};

type Detail = {
  inbound: Record<string, unknown>;
  parsed: Record<string, unknown> | null;
  sync: Record<string, unknown> | null;
  reconciliation: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  candidates: Candidate[];
};

type Metrics = {
  by_state: Record<string, number>;
  by_reconciliation: Record<string, number>;
  auto_links: number;
  manual_confirmations: number;
  manual_rejections: number;
  rates: Record<string, number | null>;
};

/* ─── Filters and labels ─────────────────────────────────────── */

const PIPELINE_ORDER = [
  "received", "classified", "parsed", "needs_review",
  "ready_for_approval", "approved", "synced", "reconciled",
  "rejected", "failed", "posted",
];

const RECON_ORDER = [
  "no_candidates", "candidate_found", "needs_review",
  "confirmed", "rejected",
];

const QUICK_FILTERS: Array<{ key: string; label: string; pred: (d: Doc) => boolean }> = [
  { key: "all",             label: "Todos",            pred: () => true },
  { key: "approved",        label: "Approved",         pred: (d) => d.status === "approved" },
  { key: "synced",          label: "Synced",           pred: (d) => d.status === "synced" },
  { key: "reconciled",      label: "Reconciled",       pred: (d) => d.status === "reconciled" },
  { key: "needs_review",    label: "Needs review",     pred: (d) => d.match_status === "needs_review" },
  { key: "candidate_found", label: "Candidate found",  pred: (d) => d.match_status === "candidate_found" },
  { key: "no_candidates",   label: "No candidates",    pred: (d) => d.match_status === "no_candidates" },
];

function statusBadge(s?: string): string {
  if (!s) return "#94a3b8";
  switch (s) {
    case "reconciled": return "#15803d";
    case "synced": return "#1d4ed8";
    case "approved": return "#ca8a04";
    case "needs_review": return "#b45309";
    case "candidate_found": return "#0891b2";
    case "no_candidates": return "#6b7280";
    case "confirmed": return "#15803d";
    case "rejected": return "#b91c1c";
    case "failed": return "#b91c1c";
    default: return "#64748b";
  }
}

/* ═══════════════════════════════════════════════════════════════ */
export default function StagingSection({ user }: { user: User }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(7);
  const [rejectNote, setRejectNote] = useState<string>("");

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await authedFetch(user, `/api/staging${path}`, init);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return json;
    },
    [user]
  );

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [list, m] = await Promise.all([
        api("/documents"),
        api("/metrics"),
      ]);
      setDocs(list.documents || []);
      setMetrics(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d: Detail = await api(`/documents/${id}`);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setError(null);
    try {
      await fn();
      await refresh();
      if (selectedId === id) await loadDetail(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const doSync      = (id: string) => run(id, () => api(`/documents/${id}/sync`, { method: "POST", body: "{}" }));
  const doReconcile = (id: string, w = windowDays) =>
    run(id, () => api(`/documents/${id}/reconcile`, {
      method: "POST", body: JSON.stringify({ window_days: w }),
    }));
  const doConfirm = (id: string, movementId: string) =>
    run(id, () => api(`/documents/${id}/reconcile-review`, {
      method: "POST", body: JSON.stringify({ confirm_movement_id: movementId }),
    }));
  const doReject = (id: string, notes?: string) =>
    run(id, () => api(`/documents/${id}/reconcile-review`, {
      method: "POST", body: JSON.stringify({ reject: true, notes: notes || null }),
    }));

  const filtered = docs.filter(
    QUICK_FILTERS.find(f => f.key === filter)?.pred ?? (() => true)
  );

  return (
    <div>
      <div style={pageTitle}>Staging pipeline</div>
      <div style={pageSub}>
        received → classified → parsed → ready_for_approval → approved → synced → reconciled
      </div>

      {/* ── Metrics row ──────────────────────────────────────── */}
      {metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, margin: "12px 0" }}>
          {PIPELINE_ORDER.map(s => (
            (metrics.by_state[s] ?? 0) > 0 && (
              <div key={s} style={kpiBox}>
                <div style={kpiLbl}>{s}</div>
                <div style={kpiVal}>{metrics.by_state[s]}</div>
              </div>
            )
          ))}
          {RECON_ORDER.map(s => (
            (metrics.by_reconciliation[s] ?? 0) > 0 && (
              <div key={`r-${s}`} style={kpiBox}>
                <div style={kpiLbl}>recon: {s}</div>
                <div style={kpiVal}>{metrics.by_reconciliation[s]}</div>
              </div>
            )
          ))}
          <div style={kpiBox}>
            <div style={kpiLbl}>auto-links</div>
            <div style={kpiVal}>{metrics.auto_links}</div>
          </div>
          <div style={kpiBox}>
            <div style={kpiLbl}>confirmadas</div>
            <div style={kpiVal}>{metrics.manual_confirmations}</div>
          </div>
          <div style={kpiBox}>
            <div style={kpiLbl}>rechazadas</div>
            <div style={kpiVal}>{metrics.manual_rejections}</div>
          </div>
          {metrics.rates.sync_over_approved !== null && (
            <div style={kpiBox}>
              <div style={kpiLbl}>sync/approved</div>
              <div style={kpiVal}>{Math.round((metrics.rates.sync_over_approved ?? 0) * 100)}%</div>
            </div>
          )}
          {metrics.rates.reconciled_over_synced !== null && (
            <div style={kpiBox}>
              <div style={kpiLbl}>reconciled/synced</div>
              <div style={kpiVal}>{Math.round((metrics.rates.reconciled_over_synced ?? 0) * 100)}%</div>
            </div>
          )}
          {metrics.rates.auto_link_over_reconciled !== null && (
            <div style={kpiBox}>
              <div style={kpiLbl}>auto-link %</div>
              <div style={kpiVal}>{Math.round((metrics.rates.auto_link_over_reconciled ?? 0) * 100)}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── Filters + refresh ────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
        {QUICK_FILTERS.map(f => (
          <button key={f.key} style={filter === f.key ? btnPrimary : btnGhost} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 12, fontSize: 12, color: "#64748b" }}>
          Ventana reconcile:
        </span>
        <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}
                style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4 }}>
          <option value={3}>±3d</option>
          <option value={7}>±7d</option>
          <option value={14}>±14d</option>
          <option value={30}>±30d</option>
        </select>
        <button style={btnGhost} onClick={refresh} disabled={loading}>
          {loading ? "..." : "Refresh"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
          {filtered.length} / {docs.length} docs
        </span>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", background: T.dangerBg, border: "1px solid #fecaca",
                      padding: 8, borderRadius: 4, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 480px" : "1fr", gap: 12 }}>
        {/* ── Table ──────────────────────────────────────────── */}
        <div style={tableWrap}>
          <table style={tbl}>
            <thead>
              <tr style={trHead}>
                <th style={th}>Doc</th>
                <th style={th}>Supplier</th>
                <th style={th}>Invoice</th>
                <th style={th}>Date</th>
                <th style={tdR}>Total</th>
                <th style={th}>Pipeline</th>
                <th style={th}>Recon</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} style={{ ...trBody, cursor: "pointer",
                                         background: selectedId === d.id ? T.infoBg : "transparent" }}
                    onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}>
                  <td style={td}>
                    <div style={{ fontFamily: "monospace", fontSize: 11 }}>{d.id.slice(0, 8)}…</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{d.source_ref || d.subject || ""}</div>
                  </td>
                  <td style={td}>
                    {d.supplier_name || <i style={{ color: "#94a3b8" }}>—</i>}
                    {d.supplier_tax_id && <div style={{ fontSize: 11, color: "#64748b" }}>{d.supplier_tax_id}</div>}
                  </td>
                  <td style={td}>{d.invoice_number || <i style={{ color: "#94a3b8" }}>—</i>}</td>
                  <td style={td}>{d.issue_date || ""}</td>
                  <td style={tdR}>{d.total != null ? `${fmt(d.total)} ${d.currency || ""}` : ""}</td>
                  <td style={td}>
                    <span style={{ ...badge, background: statusBadge(d.status) }}>{d.status}</span>
                  </td>
                  <td style={td}>
                    {d.match_status ? (
                      <span style={{ ...badge, background: statusBadge(d.match_status) }}>
                        {d.match_status}{d.confidence != null ? ` ${Math.round(d.confidence * 100)}%` : ""}
                      </span>
                    ) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={td} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {d.status === "approved" && (
                        <button style={btnSmall} disabled={busyId === d.id}
                                onClick={() => doSync(d.id)}>Sync</button>
                      )}
                      {d.status === "synced" && (
                        <button style={btnSmall} disabled={busyId === d.id}
                                onClick={() => doReconcile(d.id)}>Reconcile</button>
                      )}
                      {d.status === "reconciled" && (
                        <span style={{ fontSize: 11, color: "#15803d" }}>✓ linked</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td style={td} colSpan={8}>
                  <span style={{ color: "#94a3b8" }}>Sin documentos para este filtro.</span>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Side panel ─────────────────────────────────────── */}
        {selectedId && detail && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 12, background: T.surface,
                        maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>Detalle</div>
              <button style={btnGhost} onClick={() => setSelectedId(null)}>×</button>
            </div>

            {/* Header */}
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <div><b>inbound:</b> <span style={{ fontFamily: "monospace" }}>{String(detail.inbound.id)}</span></div>
              <div><b>status:</b> <span style={{ ...badge, background: statusBadge(String(detail.inbound.status)) }}>{String(detail.inbound.status)}</span></div>
              {detail.parsed && (
                <>
                  <div><b>supplier:</b> {String(detail.parsed.supplier_name || "")}
                    {detail.parsed.supplier_tax_id ? ` (${detail.parsed.supplier_tax_id})` : ""}</div>
                  <div><b>invoice:</b> {String(detail.parsed.invoice_number || "")} — {String(detail.parsed.issue_date || "")}</div>
                  <div><b>total:</b> {fmt(Number(detail.parsed.total) || 0)} {String(detail.parsed.currency || "")}</div>
                </>
              )}
              {detail.sync && (
                <div><b>remote invoice:</b> <span style={{ fontFamily: "monospace", fontSize: 11 }}>{String(detail.sync.remote_path)}</span></div>
              )}
            </div>

            {/* Reconciliation outcome */}
            {detail.reconciliation && (
              <div style={{ marginTop: 12, padding: 8, background: "#f8fafc", borderRadius: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Reconciliación</div>
                <div>outcome: <span style={{ ...badge, background: statusBadge(String(detail.reconciliation.match_status)) }}>{String(detail.reconciliation.match_status)}</span></div>
                <div>confidence: {Math.round(Number(detail.reconciliation.confidence || 0) * 100)}%</div>
                {detail.reconciliation.backlink_written ? <div style={{ color: "#15803d" }}>✓ invoiceRef escrito en Firestore</div> : null}
                {detail.reconciliation.human_confirmed ? <div>✓ confirmación humana</div> : null}
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {detail.inbound.status === "approved" && (
                <button style={btnPrimary} disabled={busyId === selectedId}
                        onClick={() => doSync(selectedId)}>Sync</button>
              )}
              {detail.inbound.status === "synced" && (
                <>
                  <button style={btnPrimary} disabled={busyId === selectedId}
                          onClick={() => doReconcile(selectedId, windowDays)}>
                    Reconcile (±{windowDays}d)
                  </button>
                  <button style={btnGhost} disabled={busyId === selectedId}
                          onClick={() => doReconcile(selectedId, 14)}>Reconcile ±14d</button>
                </>
              )}
              {detail.reconciliation && detail.reconciliation.match_status !== "confirmed" && (
                <button style={btnGhost} disabled={busyId === selectedId}
                        onClick={() => doReject(selectedId, rejectNote)}>Rechazar reconciliación</button>
              )}
            </div>
            {detail.reconciliation && detail.reconciliation.match_status !== "confirmed" && (
              <input placeholder="Nota de rechazo (opcional)" value={rejectNote}
                     onChange={e => setRejectNote(e.target.value)}
                     style={{ width: "100%", marginTop: 6, padding: 6, border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 12 }} />
            )}

            {/* Candidates */}
            {detail.candidates && detail.candidates.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Candidatos ({detail.candidates.length})</div>
                {detail.candidates.map(c => (
                  <div key={c.movement_id}
                       style={{ border: "1px solid #e2e8f0", borderRadius: 4, padding: 8, marginTop: 6, fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 11 }}>{c.movement_id}</div>
                      <div style={{ fontWeight: 600 }}>score {Math.round(c.score * 100)}%</div>
                    </div>
                    <div>{c.movement_date} — {fmt(c.movement_amount || 0)} €</div>
                    <div style={{ color: "#475569" }}>{c.movement_concept}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {c.movement_category && <span style={{ ...badge, background: "#0891b2" }}>{c.movement_category}</span>}
                      {c.movement_status && <span style={{ ...badge, background: "#64748b" }}>{c.movement_status}</span>}
                      {c.movement_invoice_ref && <span style={{ ...badge, background: "#b91c1c" }}>already linked</span>}
                    </div>
                    <div style={{ marginTop: 4, color: "#334155" }}>
                      Δ€ {c.amount_delta ?? "—"} · Δd {c.date_delta_days ?? "—"}
                    </div>
                    <ul style={{ margin: "4px 0 4px 16px", padding: 0 }}>
                      {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                    <div style={{ marginTop: 4 }}>
                      <button style={btnSmall} disabled={busyId === selectedId || !!c.movement_invoice_ref}
                              onClick={() => doConfirm(selectedId, c.movement_id)}>
                        {c.movement_invoice_ref ? "— ya enlazada" : "Confirmar este"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Events */}
            {detail.events && detail.events.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#64748b" }}>
                  Audit trail ({detail.events.length})
                </summary>
                <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
                  {detail.events.map((e, i) => (
                    <div key={i}>
                      {String(e.occurred_at)} · {String(e.from_state || "∅")} → {String(e.to_state)} · {String(e.actor)}
                      {e.note ? ` — ${String(e.note)}` : ""}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
