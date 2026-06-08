"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub, tableWrap, tableHead, tableRow, fmt } from "../theme"

// ── Types ──────────────────────────────────────────────────────

type Customer = {
  id: string
  name?: string
  email?: string
  numericCode?: string
  type?: "app" | "teacher" | "pos_anonymous"
  segment: string
  totalVisits: number
  totalSpent: number
  avgTicket: number
  loyaltyPoints: number
  totalPointsEarned: number
  totalPointsRedeemed?: number
  lastVisit?: { _seconds: number }
  firstVisit?: { _seconds: number }
  coffeeKnowledge?: string
  favoriteProducts?: string[]
  completedQuizzes?: string[]
  unlockedBadges?: string[]
  hasReusableCup?: boolean
  appOrders?: number
  totalRedemptions?: number
  orgId?: string
}

type LoyaltyTx = {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string
  createdAt: string
  status: string
}

type Stats = {
  totalCustomers: number
  totalRevenue: number
  avgTicketGlobal: number
  segments: Record<string, number>
}

type ExamPassSummary = {
  passId: string
  userId: string
  creditsTotal: number
  creditsUsed: number
  creditsReserved: number
  creditsAvailable: number
  purchasedAt: string | null
  expiresAt: string | null
  purchasePrice: 20 | 22
  lastUsedAt: string | null
}

interface CustomersSectionProps {
  user: User
  orgId: string
}

// ── Constants ──────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  new: "#6366f1",
  occasional: "#3b82f6",
  regular: "#16a34a",
  loyal: "#f59e0b",
  churning: "#dc2626",
}

const SEGMENT_LABELS: Record<string, string> = {
  new: "Nuevo",
  occasional: "Ocasional",
  regular: "Regular",
  loyal: "Leal",
  churning: "En riesgo",
}

const TX_TYPE_LABELS: Record<string, string> = {
  "earn.purchase": "Compra",
  "earn.quiz": "Quiz",
  "earn.mission": "Misión",
  "earn.badge": "Badge",
  "earn.streak": "Racha",
  "earn.campaign": "Campaña",
  "earn.referral": "Referido",
  "earn.manual": "Ajuste +",
  "redeem.reward": "Canje",
  "reverse.purchase": "Reverso compra",
  "reverse.redemption": "Reverso canje",
  "reverse.manual": "Reverso manual",
  "expire": "Expirado",
  "correction": "Corrección",
}

// ── Sub-components ─────────────────────────────────────────────

function AdjustModal({
  customer,
  user,
  orgId,
  onClose,
  onSuccess,
}: {
  customer: Customer
  user: User
  orgId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ balanceAfter: number } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pts = parseInt(amount, 10)
    if (!pts || isNaN(pts)) return setError("Introduce un número de puntos válido")
    if (!reason.trim() || reason.trim().length < 3) return setError("Escribe un motivo (mínimo 3 caracteres)")

    setLoading(true)
    setError(null)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/loyalty/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: customer.id, amount: pts, reason: reason.trim() }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) {
        setError(d.error || "Error al ajustar puntos")
      } else {
        setResult({ balanceAfter: d.balanceAfter })
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  }
  const modalStyle: React.CSSProperties = {
    background: T.surface, borderRadius: 14, padding: 28, width: 440,
    maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Ajuste manual de puntos</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
              {customer.name || customer.email || customer.id.slice(0, 12)}
              {customer.numericCode && <span style={{ marginLeft: 8, fontFamily: T.mono, background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>#{customer.numericCode}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.dim }}>✕</button>
        </div>

        {/* Current balance */}
        <div style={{ background: "#f8f8f8", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: T.dim }}>Saldo actual</span>
          <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 16 }}>☕ {(customer.loyaltyPoints || 0).toLocaleString()} pts</span>
        </div>

        {result ? (
          <div>
            <div style={{ background: T.successBg, border: "1px solid #bbf7d0", borderRadius: 10, padding: 16, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#166534" }}>✓ Ajuste aplicado</div>
              <div style={{ fontSize: 13, color: "#15803d", marginTop: 6 }}>
                Nuevo saldo: <strong>{result.balanceAfter.toLocaleString()} pts</strong>
              </div>
            </div>
            <button
              onClick={() => { onSuccess(); onClose() }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Cerrar y actualizar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>
                Puntos (positivo = añadir, negativo = quitar)
              </label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="p.ej. -500 para quitar 500 pts"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, fontFamily: T.mono, boxSizing: "border-box" }}
                disabled={loading}
                autoFocus
              />
              <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>
                Tip galletas: introduce la cantidad negativa de puntos que debería haber costado la recompensa
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>
                Motivo (aparecerá en el historial)
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="p.ej. Galletas entregadas sin canje digital"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, boxSizing: "border-box" }}
                disabled={loading}
              />
            </div>
            {error && (
              <div style={{ background: T.dangerBg, border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991b1b", marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #e5e7eb", background: T.surface, color: T.muted, fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !amount || !reason.trim()}
                style={{
                  flex: 2, padding: "10px 0", borderRadius: 8, border: "none",
                  background: loading || !amount || !reason.trim() ? "#d1d5db" : "#dc2626",
                  color: "#fff", fontWeight: 600, fontSize: 13,
                  cursor: loading || !amount || !reason.trim() ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Aplicando..." : "Aplicar ajuste"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function CustomerDetail({
  customer,
  user,
  orgId,
  pass,
}: {
  customer: Customer
  user: User
  orgId: string
  pass?: ExamPassSummary
}) {
  const [transactions, setTransactions] = useState<LoyaltyTx[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authedFetch(user, `/api/org/${orgId}/loyalty/balance?uid=${customer.id}`)
      .then(r => r.json())
      .then(d => {
        setTransactions((d.transactions || []).slice(0, 10))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [customer.id, orgId, user])

  const rowBg = (tx: LoyaltyTx) => {
    if (tx.amount > 0) return T.successBg
    if (tx.type === "redeem.reward") return "#fef3c7"
    return T.dangerBg
  }

  return (
    <div style={{ padding: "14px 16px 16px", background: "#fafafa", borderTop: "1px solid #f3f4f6" }}>
      {/* Bono activo (si lo tiene) */}
      {pass && (
        <div style={{
          background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10,
          padding: "10px 14px", marginBottom: 12,
          display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr", gap: 16, alignItems: "center",
        }}>
          <span style={{ fontSize: 18 }}>🎟️</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#92400e", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              Bono activo
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f", marginTop: 2 }}>
              {pass.creditsAvailable}/{pass.creditsTotal} cafés
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#92400e", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              Usados
            </div>
            <div style={{ fontSize: 13, fontFamily: T.mono, color: "#78350f", marginTop: 2 }}>
              {pass.creditsUsed}{pass.creditsReserved > 0 ? ` (+${pass.creditsReserved} res.)` : ""}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#92400e", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              Vence
            </div>
            <div style={{ fontSize: 13, fontFamily: T.mono, color: "#78350f", marginTop: 2 }}>
              {pass.expiresAt
                ? new Date(pass.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
                : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#92400e", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              Comprado
            </div>
            <div style={{ fontSize: 13, fontFamily: T.mono, color: "#78350f", marginTop: 2 }}>
              {pass.purchasedAt
                ? new Date(pass.purchasedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                : "—"} · {pass.purchasePrice}€
            </div>
          </div>
        </div>
      )}

      {/* Client info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {customer.numericCode && (
          <InfoChip label="Código cliente" value={`#${customer.numericCode}`} mono />
        )}
        <InfoChip label="ID sistema" value={customer.id.slice(0, 14) + "…"} mono />
        <InfoChip label="Tipo" value={customer.type === "app" ? "App" : customer.type === "teacher" ? "Profesor" : customer.type === "pos_anonymous" ? "POS anon." : "—"} />
        <InfoChip label="1ª visita" value={customer.firstVisit ? new Date(customer.firstVisit._seconds * 1000).toLocaleDateString("es-ES") : "—"} />
        <InfoChip label="Ganados total" value={`${(customer.totalPointsEarned || 0).toLocaleString()} pts`} />
        <InfoChip label="Canjeados total" value={`${(customer.totalPointsRedeemed || 0).toLocaleString()} pts`} />
        <InfoChip label="Canjes totales" value={String(customer.totalRedemptions || 0)} />
        <InfoChip label="Pedidos app" value={String(customer.appOrders || 0)} />
        {customer.favoriteProducts && customer.favoriteProducts.length > 0 && (
          <div style={{ gridColumn: "1 / -1", background: T.surface, borderRadius: 8, padding: "8px 12px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>Productos favoritos</div>
            <div style={{ fontSize: 12, color: T.text }}>{customer.favoriteProducts.slice(0, 6).join(", ")}</div>
          </div>
        )}
        {customer.unlockedBadges && customer.unlockedBadges.length > 0 && (
          <div style={{ gridColumn: "1 / -1", background: T.surface, borderRadius: 8, padding: "8px 12px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>Badges desbloqueados</div>
            <div style={{ fontSize: 12, color: T.text }}>{customer.unlockedBadges.join(", ")}</div>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 8 }}>
        Últimas transacciones de puntos
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: T.dim, padding: "8px 0" }}>Cargando...</div>
      ) : transactions.length === 0 ? (
        <div style={{ fontSize: 12, color: T.dim, padding: "8px 0" }}>Sin transacciones registradas</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {transactions.map(tx => (
            <div key={tx.id} style={{
              display: "grid", gridTemplateColumns: "120px 1fr 80px 90px",
              gap: 8, alignItems: "center", padding: "6px 10px",
              borderRadius: 7, background: rowBg(tx), fontSize: 12,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dim }}>
                {new Date(tx.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ color: T.text }}>{tx.description || TX_TYPE_LABELS[tx.type] || tx.type}</span>
              <span style={{ fontFamily: T.mono, fontWeight: 700, color: tx.amount > 0 ? "#16a34a" : "#dc2626", textAlign: "right" }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, textAlign: "right" }}>
                → {tx.balanceAfter.toLocaleString()} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: T.surface, borderRadius: 8, padding: "8px 12px", border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: mono ? T.mono : T.font }}>{value}</div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function CustomersSection({ user, orgId }: CustomersSectionProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("totalSpent")
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState<Record<string, any> | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<Customer | null>(null)
  const [search, setSearch] = useState("")
  // Bonos activos indexados por userId. Permite mostrar badge en la fila
  // y bloque de detalle expandido para clientes que tienen bono.
  const [passByUserId, setPassByUserId] = useState<Map<string, ExamPassSummary>>(
    new Map(),
  )
  // Filtro "solo con bono activo".
  const [onlyWithPass, setOnlyWithPass] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "200", sortBy })
      if (filter !== "all") params.set("segment", filter)
      const r = await authedFetch(user, `/api/org/${orgId}/customers?${params}`)
      const d = await r.json()
      setCustomers(d.customers || [])
      setStats(d.stats || null)
    } catch (e) {
      console.error("Error fetching customers:", e)
    }
    setLoading(false)
  }, [user, orgId, filter, sortBy])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // Fetch independiente de bonos activos. Se hace en paralelo a customers
  // y no bloquea la tabla si falla. Refresca tras backfill / ajustes.
  const fetchActivePasses = useCallback(async () => {
    try {
      const r = await authedFetch(
        user,
        `/api/org/${orgId}/exam-pass/admin/list-active-passes`,
      )
      if (!r.ok) {
        // 404 si Brain no tiene el endpoint todavía (deploy viejo); silenciamos.
        if (r.status !== 404) {
          console.warn("[CustomersSection] list-active-passes fallo:", r.status)
        }
        setPassByUserId(new Map())
        return
      }
      const d = await r.json()
      const map = new Map<string, ExamPassSummary>()
      for (const p of (d.passes ?? []) as ExamPassSummary[]) {
        map.set(p.userId, p)
      }
      setPassByUserId(map)
    } catch (e) {
      console.warn("[CustomersSection] error fetching active passes:", e)
      setPassByUserId(new Map())
    }
  }, [user, orgId])

  useEffect(() => { fetchActivePasses() }, [fetchActivePasses])

  const handleBackfill = async () => {
    setBackfillLoading(true)
    setBackfillResult(null)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/customers/backfill-orgid`, { method: "POST" })
      const d = await r.json()
      setBackfillResult(d)
      if (d.updated > 0) fetchCustomers()
    } catch (e) {
      setBackfillResult({ success: false, error: String(e) })
    }
    setBackfillLoading(false)
  }

  const total = stats?.totalCustomers || 0
  const maxSegment = total > 0 ? Math.max(...Object.values(stats?.segments || {})) : 1

  // Filter by search + opcionalmente "solo con bono".
  const displayed = customers.filter(c => {
    if (onlyWithPass && !passByUserId.has(c.id)) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.numericCode || "").includes(q) ||
      c.id.includes(q)
    )
  })

  const passCount = passByUserId.size

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={pageTitle}>Clientes</h1>
          <p style={pageSub}>Segmentación, engagement y métricas de clientes</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button
            onClick={handleBackfill}
            disabled={backfillLoading}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "1px solid #7c3aed", background: backfillLoading ? "#d1d5db" : "#7c3aed",
              color: "#fff", cursor: backfillLoading ? "not-allowed" : "pointer",
            }}
          >
            {backfillLoading ? "Sincronizando..." : "Sincronizar clientes"}
          </button>
          {backfillResult && (
            <span style={{ fontSize: 11, color: backfillResult.success ? "#16a34a" : "#dc2626" }}>
              {backfillResult.success
                ? `✓ ${backfillResult.updated} actualizados, ${backfillResult.skipped} ya OK (total: ${backfillResult.total})`
                : `Error: ${backfillResult.error}`}
            </span>
          )}
        </div>
      </div>

      {/* Segment distribution */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          {Object.entries(stats.segments).map(([seg, count]) => (
            <div
              key={seg}
              onClick={() => setFilter(filter === seg ? "all" : seg)}
              style={{
                background: filter === seg ? SEGMENT_COLORS[seg] + "20" : T.surface,
                border: `1px solid ${filter === seg ? SEGMENT_COLORS[seg] : "#e5e7eb"}`,
                borderRadius: 10,
                padding: "14px 12px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: SEGMENT_COLORS[seg] }}>{count}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{SEGMENT_LABELS[seg]}</div>
              {total > 0 && (
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / maxSegment) * 100}%`, background: SEGMENT_COLORS[seg], borderRadius: 2 }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ background: T.surface, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalCustomers}</div>
            <div style={{ fontSize: 11, color: T.dim }}>Total clientes</div>
          </div>
          <div style={{ background: T.surface, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stats.totalRevenue)}€</div>
            <div style={{ fontSize: 11, color: T.dim }}>Revenue total</div>
          </div>
          <div style={{ background: T.surface, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stats.avgTicketGlobal)}€</div>
            <div style={{ fontSize: 11, color: T.dim }}>Ticket medio global</div>
          </div>
        </div>
      )}

      {/* Controls: sort + search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        {[
          { key: "totalSpent", label: "Por gasto" },
          { key: "totalVisits", label: "Por visitas" },
          { key: "loyaltyPoints", label: "Por puntos" },
          { key: "lastVisit", label: "Por última visita" },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12,
              border: `1px solid ${sortBy === s.key ? T.accent : "#e5e7eb"}`,
              background: sortBy === s.key ? T.accent10 : "#fff",
              color: sortBy === s.key ? T.accent : T.dim,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setOnlyWithPass(v => !v)}
          title="Mostrar solo clientes con bono activo"
          style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12,
            border: `1px solid ${onlyWithPass ? "#a16207" : "#e5e7eb"}`,
            background: onlyWithPass ? "#fef3c7" : T.surface,
            color: onlyWithPass ? "#92400e" : T.dim,
            cursor: "pointer", fontWeight: onlyWithPass ? 600 : 400,
          }}
        >
          🎟️ Con bono ({passCount})
        </button>
        <input
          type="text"
          placeholder="Buscar por nombre, email, código…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: "auto", padding: "6px 12px", borderRadius: 8,
            border: "1px solid #e5e7eb", fontSize: 12, width: 240, outline: "none",
          }}
        />
      </div>

      {/* Customer table */}
      <div style={tableWrap}>
        {/* Column headers */}
        <div style={{
          ...tableHead,
          display: "grid",
          gridTemplateColumns: "2fr 80px 1fr 90px 90px 100px 80px 60px",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            {filter !== "all" ? `${SEGMENT_LABELS[filter]} (${displayed.length})` : `Todos los clientes (${displayed.length})`}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Código</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Segmento</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "right" }}>Visitas</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "right" }}>Gasto</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "right" }}>Puntos</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "right" }}>Última visita</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}></span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Cargando...</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>
            No hay clientes. Si acabas de configurar la app, pulsa "Sincronizar clientes" para importar los perfiles existentes.
          </div>
        ) : (
          displayed.map(c => {
            const daysSince = c.lastVisit?._seconds
              ? Math.floor((Date.now() / 1000 - c.lastVisit._seconds) / 86400)
              : null
            const isExpanded = expandedId === c.id

            return (
              <div key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                {/* Main row */}
                <div
                  style={{
                    ...tableRow,
                    borderBottom: "none",
                    display: "grid",
                    gridTemplateColumns: "2fr 80px 1fr 90px 90px 100px 80px 60px",
                    alignItems: "center",
                    cursor: "pointer",
                    background: isExpanded ? "#fafafa" : "transparent",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  {/* Name / email */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{c.name || c.email || c.id.slice(0, 12)}</span>
                      {(() => {
                        const pass = passByUserId.get(c.id)
                        if (!pass) return null
                        return (
                          <span
                            title={`Bono activo: ${pass.creditsAvailable}/${pass.creditsTotal} cafés${
                              pass.expiresAt
                                ? ` · vence ${new Date(pass.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
                                : ""
                            }`}
                            style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10,
                              background: "#fef3c7", color: "#92400e",
                              border: "1px solid #fde68a",
                            }}
                          >
                            🎟️ {pass.creditsAvailable}/{pass.creditsTotal}
                          </span>
                        )
                      })()}
                    </div>
                    {c.email && c.name && <div style={{ fontSize: 11, color: T.dim }}>{c.email}</div>}
                    {!c.orgId && (
                      <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, marginTop: 1 }}>⚠ Sin orgId — sincronizar</div>
                    )}
                  </div>

                  {/* Numeric code */}
                  <div>
                    {c.numericCode ? (
                      <span style={{
                        fontSize: 12, fontFamily: T.mono, fontWeight: 700,
                        background: "#f3f4f6", padding: "3px 7px", borderRadius: 5, color: T.text,
                      }}>
                        #{c.numericCode}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: T.dim }}>—</span>
                    )}
                  </div>

                  {/* Segment */}
                  <div>
                    <span style={{
                      fontSize: 11, padding: "3px 8px", borderRadius: 20,
                      background: SEGMENT_COLORS[c.segment] + "15",
                      color: SEGMENT_COLORS[c.segment],
                      fontWeight: 600,
                    }}>
                      {SEGMENT_LABELS[c.segment] || c.segment}
                    </span>
                  </div>

                  {/* Visits */}
                  <div style={{ fontSize: 13, fontFamily: T.mono, textAlign: "right" }}>{c.totalVisits}</div>

                  {/* Spent */}
                  <div style={{ fontSize: 13, fontFamily: T.mono, textAlign: "right" }}>{fmt(c.totalSpent)}€</div>

                  {/* Points */}
                  <div style={{ fontSize: 13, fontFamily: T.mono, textAlign: "right", fontWeight: 600 }}>
                    ☕ {(c.loyaltyPoints || 0).toLocaleString()}
                  </div>

                  {/* Last visit */}
                  <div style={{ fontSize: 11, color: T.dim, textAlign: "right" }}>
                    {daysSince !== null ? (
                      daysSince === 0 ? "hoy" :
                      daysSince === 1 ? "ayer" :
                      `hace ${daysSince}d`
                    ) : "—"}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                    <button
                      title="Ajuste manual de puntos"
                      onClick={() => setAdjustTarget(c)}
                      style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 11,
                        border: "1px solid #e5e7eb", background: T.surface, cursor: "pointer",
                        color: "#dc2626", fontWeight: 600,
                      }}
                    >
                      ± pts
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <CustomerDetail
                    customer={c}
                    user={user}
                    orgId={orgId}
                    pass={passByUserId.get(c.id)}
                  />
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Manual adjust modal */}
      {adjustTarget && (
        <AdjustModal
          customer={adjustTarget}
          user={user}
          orgId={orgId}
          onClose={() => setAdjustTarget(null)}
          onSuccess={fetchCustomers}
        />
      )}
    </div>
  )
}
