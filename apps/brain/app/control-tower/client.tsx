"use client"

import { useState } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../lib/authed-fetch"

interface ReconcileResult {
  uid: string
  cachedBalance: number
  ledgerBalance: number
  match: boolean
  drift: number
  message: string
}

interface ExpireResult {
  status: string
  message: string
  summary: Record<string, unknown>
  errors?: string[]
}

const T = {
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'SF Mono', 'Cascadia Code', Menlo, monospace",
  border: "#e5e5e5",
  bg: "#f8f8f8",
  text: "#1a1a1a",
  muted: "#6b7280",
  dim: "#9ca3af",
  accent: "#8b6f47",
}

const input: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontFamily: T.font, fontSize: 13, outline: "none", boxSizing: "border-box" }
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer" }
const btnSmall: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 12, cursor: "pointer" }

export default function ControlTowerClient({ orgId, user }: { orgId: string; user: User }) {
  const [reconcileUid, setReconcileUid] = useState("")
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null)
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [reconcileError, setReconcileError] = useState<string | null>(null)

  const [expireLoading, setExpireLoading] = useState(false)
  const [expireResult, setExpireResult] = useState<ExpireResult | null>(null)
  const [expireError, setExpireError] = useState<string | null>(null)

  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState<Record<string, unknown> | null>(null)
  const [backfillError, setBackfillError] = useState<string | null>(null)

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault()
    setReconcileLoading(true)
    setReconcileError(null)
    setReconcileResult(null)

    try {
      const response = await authedFetch(user, `/api/org/${orgId}/loyalty/reconcile?uid=${encodeURIComponent(reconcileUid)}`)
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      const result = await response.json()
      setReconcileResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setReconcileError(msg)
    } finally {
      setReconcileLoading(false)
    }
  }

  const handleExpire = async () => {
    if (!confirm("¿Ejecutar expiración masiva?\n\nEsto expirará TODAS las redemptions pendientes que hayan superado las 48h. Esta acción no se puede deshacer.")) return;
    setExpireLoading(true)
    setExpireError(null)
    setExpireResult(null)

    try {
      const response = await authedFetch(user, `/api/org/${orgId}/loyalty/expire-redemptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      const result = await response.json()
      setExpireResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExpireError(msg)
    } finally {
      setExpireLoading(false)
    }
  }

  const handleBackfill = async () => {
    setBackfillLoading(true)
    setBackfillError(null)
    setBackfillResult(null)

    try {
      const response = await authedFetch(user, `/api/org/${orgId}/customers/backfill-orgid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      const result = await response.json()
      setBackfillResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setBackfillError(msg)
    } finally {
      setBackfillLoading(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Reconcile User ── */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Quick Reconcile Check</h3>
        <form onSubmit={handleReconcile} style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="UID del usuario..."
            value={reconcileUid}
            onChange={e => setReconcileUid(e.target.value)}
            style={{ ...input, flex: 1 }}
            disabled={reconcileLoading}
          />
          <button type="submit" disabled={reconcileLoading || !reconcileUid.trim()} style={{ ...btnPrimary, opacity: reconcileLoading || !reconcileUid.trim() ? 0.4 : 1 }}>
            {reconcileLoading ? "Comprobando..." : "Check Balance"}
          </button>
        </form>

        {reconcileError && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
            {reconcileError}
          </div>
        )}

        {reconcileResult && (
          <div style={{ marginTop: 12, padding: 16, border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <div style={{
              padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
              background: reconcileResult.match ? "#f0fdf4" : "#fefce8",
              color: reconcileResult.match ? "#166534" : "#854d0e",
              border: `1px solid ${reconcileResult.match ? "#bbf7d0" : "#fde68a"}`,
            }}>
              {reconcileResult.match ? "✓ Balance coincide" : "⚠ Desajuste detectado"}
              {reconcileResult.message && <span style={{ fontWeight: 400, marginLeft: 8 }}>{reconcileResult.message}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <MetricBox label="Balance cache" value={reconcileResult.cachedBalance.toLocaleString()} />
              <MetricBox label="Balance ledger" value={reconcileResult.ledgerBalance.toLocaleString()} />
              <MetricBox label="Drift" value={`${reconcileResult.drift > 0 ? "+" : ""}${reconcileResult.drift.toLocaleString()}`} color={reconcileResult.drift === 0 ? "#16a34a" : "#dc2626"} />
            </div>
          </div>
        )}
      </div>

      {/* ── Expire Sweep ── */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Expire Redemptions Sweep</h3>
        <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Expira todas las redemptions pendientes que hayan superado las 48h.</p>
        <button onClick={handleExpire} disabled={expireLoading} style={{ ...btnPrimary, background: "#ea580c", opacity: expireLoading ? 0.4 : 1 }}>
          {expireLoading ? "Ejecutando..." : "Ejecutar Expire Sweep"}
        </button>

        {expireError && <ErrorBox msg={expireError} />}
        {expireResult && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#166534" }}>
            {expireResult.status === "success" ? "✓ " : ""}{expireResult.message}
            {expireResult.errors && expireResult.errors.length > 0 && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#fef2f2", borderRadius: 6, color: "#991b1b", fontSize: 12 }}>
                {expireResult.errors.map((err, i) => <div key={i}>• {err}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Backfill orgId ── */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Backfill orgId en Clientes</h3>
        <p style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Asigna orgId a customer_profiles que no lo tienen.</p>
        <button onClick={handleBackfill} disabled={backfillLoading} style={{ ...btnPrimary, background: "#7c3aed", opacity: backfillLoading ? 0.4 : 1 }}>
          {backfillLoading ? "Ejecutando..." : "Ejecutar Backfill orgId"}
        </button>

        {backfillError && <ErrorBox msg={backfillError} />}
        {backfillResult && (
          <div style={{ marginTop: 12, padding: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#166534" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {(backfillResult as Record<string, unknown>).success ? "✓ Backfill completado" : "Error en backfill"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <MetricBox label="Actualizados" value={String((backfillResult as Record<string, unknown>).updated ?? 0)} />
              <MetricBox label="Ya tenían orgId" value={String((backfillResult as Record<string, unknown>).skipped ?? 0)} />
              <MetricBox label="Total perfiles" value={String((backfillResult as Record<string, unknown>).total ?? 0)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#f8f8f8", padding: "10px 12px", borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 16, fontWeight: 700, color: color || "#1a1a1a" }}>{value}</div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
      {msg}
    </div>
  )
}
