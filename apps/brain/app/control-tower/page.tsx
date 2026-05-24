"use client"

import { useState, useEffect, useCallback } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "../../lib/firebase"
import { signInWithGoogle, consumeRedirectResult } from "../../lib/auth-client"
import { authedFetch } from "../../lib/authed-fetch"
import { useOrg } from "../hooks/useOrg"
import ControlTowerClient from "./client"

interface EconomyMetrics {
  totalPointsIssued: number
  totalPointsRedeemed: number
  pointsInCirculation: number
  estimatedLiabilityEur: number
  earnSources: Record<string, { count: number; points: number }>
  redemptionSinks: Record<string, { count: number; points: number }>
  activeRedemptions: { pending: number; used: number; expired: number }
  uniqueUsers: number
}

export default function ControlTowerPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { orgs, orgId, setOrgId, loadingOrgs } = useOrg(user)

  const [metrics, setMetrics] = useState<EconomyMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consumeRedirectResult()
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const fetchMetrics = useCallback(async () => {
    if (!user || !orgId) return
    setMetricsLoading(true)
    setError(null)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/loyalty/economy`)
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setMetrics(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setMetricsLoading(false)
    }
  }, [user, orgId])

  useEffect(() => {
    if (user && orgId) fetchMetrics()
  }, [user, orgId, fetchMetrics])

  // Auto-refresh every 60s
  useEffect(() => {
    if (!user || !orgId) return
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [user, orgId, fetchMetrics])

  /* ── Loading ── */
  if (loading || loadingOrgs) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#9ca3af" }}>Cargando...</p>
      </div>
    )
  }

  /* ── Login ── */
  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: "#1a1a1a" }}>Control Tower</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: "0 0 28px" }}>Monitorización de economía de fidelización</p>
          <button
            onClick={signInWithGoogle}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#8b6f47", color: "#fff", fontFamily: "system-ui", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Entrar con Google
          </button>
        </div>
      </div>
    )
  }

  const T = {
    font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "'SF Mono', 'Cascadia Code', Menlo, monospace",
    bg: "#f8f8f8",
    surface: "#ffffff",
    border: "#e5e5e5",
    text: "#1a1a1a",
    muted: "#6b7280",
    dim: "#9ca3af",
    accent: "#8b6f47",
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>🏗</span>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: 0, color: T.text }}>
                Control Tower
              </h1>
            </div>
            <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>Monitorización en tiempo real de la economía de fidelización</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {orgs.length > 1 && (
              <select
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }}
              >
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
              </select>
            )}
            <button
              onClick={fetchMetrics}
              disabled={metricsLoading}
              style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {metricsLoading ? "..." : "↻ Actualizar"}
            </button>
            <a href="/" style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12, textDecoration: "none", cursor: "pointer" }}>
              ← Brain
            </a>
          </div>
        </div>

        {/* Quick nav */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Economía", id: "economy" },
            { label: "Redemptions", id: "redemptions" },
            { label: "Operaciones", id: "operations" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
              style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#991b1b" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {metricsLoading && !metrics && (
          <div style={{ textAlign: "center", padding: 60, color: T.dim }}>Cargando métricas de loyalty...</div>
        )}

        {/* Metrics */}
        {metrics && (
          <>
            {/* ── Economy KPIs ── */}
            <div id="economy" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 14, color: T.text }}>
                Economía de Loyalty
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
                  <KpiCard label="Puntos emitidos" value={metrics.totalPointsIssued.toLocaleString()} color="#2563eb" bg="#eff6ff" />
                  <KpiCard label="Puntos canjeados" value={metrics.totalPointsRedeemed.toLocaleString()} color="#16a34a" bg="#f0fdf4" />
                  <KpiCard label="En circulación" value={metrics.pointsInCirculation.toLocaleString()} color="#7c3aed" bg="#f5f3ff" />
                  <KpiCard label="Pasivo estimado" value={`€${metrics.estimatedLiabilityEur.toFixed(2)}`} color="#ca8a04" bg="#fefce8" />
                  <KpiCard label="Usuarios únicos" value={String(metrics.uniqueUsers)} color="#6366f1" bg="#eef2ff" />
                </div>

                {/* Earn Sources */}
                {Object.keys(metrics.earnSources).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Fuentes de earning</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.entries(metrics.earnSources).sort((a, b) => b[1].points - a[1].points).map(([source, stats]) => (
                        <div key={source} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: T.bg, borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 500, color: T.text, textTransform: "capitalize" }}>{source}</span>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ color: T.dim, fontSize: 12 }}>{stats.count} tx</span>
                            <span style={{ fontFamily: T.mono, fontWeight: 600, color: "#2563eb" }}>{stats.points.toLocaleString()} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Redemption Sinks */}
                {Object.keys(metrics.redemptionSinks).length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Redemptions por tipo</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.entries(metrics.redemptionSinks).sort((a, b) => b[1].points - a[1].points).map(([sink, stats]) => (
                        <div key={sink} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: T.bg, borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 500, color: T.text, textTransform: "capitalize" }}>{sink}</span>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ color: T.dim, fontSize: 12 }}>{stats.count} redenciones</span>
                            <span style={{ fontFamily: T.mono, fontWeight: 600, color: "#16a34a" }}>{stats.points.toLocaleString()} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Redemption Operations ── */}
            <div id="redemptions" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 14, color: T.text }}>
                Operaciones de Redemption
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <KpiCard label="Pendientes" value={String(metrics.activeRedemptions.pending)} color="#ea580c" bg="#fff7ed" />
                  <KpiCard label="Usadas" value={String(metrics.activeRedemptions.used)} color="#16a34a" bg="#f0fdf4" />
                  <KpiCard label="Expiradas" value={String(metrics.activeRedemptions.expired)} color="#6b7280" bg="#f3f4f6" />
                </div>
              </div>
            </div>

            {/* ── Reconcile / Drift / Ops ── */}
            <div id="operations" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 14, color: T.text }}>
                Reconcile / Operaciones
              </div>
              <div style={{ padding: 20 }}>
                <ControlTowerClient orgId={orgId} user={user} />
              </div>
            </div>
          </>
        )}

        {!metrics && !metricsLoading && !error && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 60, textAlign: "center", color: T.dim }}>
            Selecciona una organización para ver datos.
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  )
}
