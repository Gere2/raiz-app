"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { Overlay, Fld, ErrorBanner } from "../ui"
import { T, page, pageTitle, pageSub, modalTitle, tableWrap, tbl, trHead, trBody, th, td, badge, kpiBox, kpiLbl, kpiVal, input, btnPrimary, btnSmall, btnGhost, fmt } from "../theme"

// ── Types ──────────────────────────────────────────────────────

type Voucher = {
  id: string
  customerName: string
  customerRef?: string
  usesTotal: number
  usesLeft: number
  pricePaid?: number | null
  paymentMethod: "cash" | "card_terminal"
  note?: string
  status: "active" | "completed"
  createdAt?: { _seconds: number }
  lastUsedAt?: { _seconds: number } | null
}

interface VouchersSectionProps {
  user: User
  orgId: string
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card_terminal: "Datáfono",
}

const fmtDate = (ts?: { _seconds: number } | null) =>
  ts?._seconds ? new Date(ts._seconds * 1000).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—"

// ── Create modal ───────────────────────────────────────────────

function NewVoucherModal({ user, orgId, onClose, onCreated }: {
  user: User
  orgId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [customerName, setCustomerName] = useState("")
  const [usesTotal, setUsesTotal] = useState("10")
  const [pricePaid, setPricePaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card_terminal">("cash")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!customerName.trim() || saving) return
    setSaving(true)
    setError("")
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, usesTotal: Number(usesTotal), pricePaid: pricePaid === "" ? null : Number(pricePaid), paymentMethod, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al crear el bono")
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el bono")
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={modalTitle}>Nuevo bono</h3>
      <Fld label="Cliente">
        <input style={{ ...input, width: "100%" }} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre del cliente" autoFocus />
      </Fld>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Fld label="Nº de usos">
            <input style={{ ...input, width: "100%" }} type="number" min={1} max={100} value={usesTotal} onChange={e => setUsesTotal(e.target.value)} />
          </Fld>
        </div>
        <div style={{ flex: 1 }}>
          <Fld label="Precio cobrado (€)">
            <input style={{ ...input, width: "100%" }} type="number" min={0} step="0.5" value={pricePaid} onChange={e => setPricePaid(e.target.value)} placeholder="Opcional" />
          </Fld>
        </div>
      </div>
      <Fld label="Método de pago">
        <select style={{ ...input, width: "100%" }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as "cash" | "card_terminal")}>
          <option value="cash">Efectivo</option>
          <option value="card_terminal">Datáfono</option>
        </select>
      </Fld>
      <Fld label="Nota">
        <input style={{ ...input, width: "100%" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Opcional — p. ej. «bono 10 cafés»" />
      </Fld>
      {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button style={btnSmall} onClick={onClose}>Cancelar</button>
        <button style={{ ...btnPrimary, opacity: !customerName.trim() || saving ? 0.5 : 1 }} disabled={!customerName.trim() || saving} onClick={save}>
          {saving ? "Guardando…" : "Crear bono"}
        </button>
      </div>
    </Overlay>
  )
}

// ── Section ────────────────────────────────────────────────────

export default function VouchersSection({ user, orgId }: VouchersSectionProps) {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchVouchers = useCallback(async () => {
    try {
      setError("")
      const res = await authedFetch(user, `/api/org/${orgId}/vouchers`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al cargar los bonos")
      setVouchers(data.vouchers || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los bonos")
    } finally {
      setLoading(false)
    }
  }, [user, orgId])

  useEffect(() => { fetchVouchers() }, [fetchVouchers])

  const act = async (voucherId: string, action: "redeem" | "undo") => {
    if (busyId) return
    setBusyId(voucherId)
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/vouchers/${voucherId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error")
      await fetchVouchers()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (v: Voucher) => {
    if (busyId) return
    if (!window.confirm(`¿Eliminar el bono de ${v.customerName}? Esta acción no se puede deshacer.`)) return
    setBusyId(v.id)
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/vouchers/${v.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al eliminar")
      await fetchVouchers()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar")
    } finally {
      setBusyId(null)
    }
  }

  const active = vouchers.filter(v => v.status === "active")
  const pendingUses = active.reduce((s, v) => s + (v.usesLeft || 0), 0)
  const revenue = vouchers.reduce((s, v) => s + (v.pricePaid || 0), 0)

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h2 style={pageTitle}>Bonos</h2>
          <p style={pageSub}>Cobra por adelantado: crea un bono (p. ej. 10 cafés), y descuenta un uso cada vez que el cliente venga.</p>
        </div>
        <button style={btnPrimary} onClick={() => setShowNew(true)}>+ Nuevo bono</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchVouchers} onDismiss={() => setError("")} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, margin: "0 0 24px" }}>
        <div style={kpiBox}>
          <div style={kpiLbl}>Bonos activos</div>
          <div style={{ ...kpiVal, color: T.accent }}>{active.length}</div>
        </div>
        <div style={kpiBox}>
          <div style={kpiLbl}>Usos pendientes</div>
          <div style={kpiVal}>{pendingUses}</div>
        </div>
        <div style={kpiBox}>
          <div style={kpiLbl}>Ingresos por bonos</div>
          <div style={kpiVal}>{fmt(revenue)} €</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: T.muted, fontSize: 14 }}>Cargando bonos…</p>
      ) : vouchers.length === 0 ? (
        <div style={{ ...kpiBox, padding: "32px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600, color: T.text }}>Todavía no hay bonos</p>
          <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>El bono es dinero que entra hoy por consumo futuro: ideal para clientes habituales.</p>
        </div>
      ) : (
        <div style={tableWrap}>
          <table style={tbl}>
            <thead>
              <tr style={trHead}>
                <th style={{ ...th, textAlign: "left" }}>Cliente</th>
                <th style={{ ...th, textAlign: "center" }}>Usos</th>
                <th style={{ ...th, textAlign: "right" }}>Pagado</th>
                <th style={{ ...th, textAlign: "left" }}>Método</th>
                <th style={{ ...th, textAlign: "left" }}>Último uso</th>
                <th style={{ ...th, textAlign: "left" }}>Estado</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map(v => {
                const busy = busyId === v.id
                return (
                  <tr key={v.id} style={trBody}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{v.customerName}</div>
                      {v.note && <div style={{ fontSize: 12, color: T.dim }}>{v.note}</div>}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontFamily: T.mono, fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>{v.usesLeft}</span>
                      <span style={{ color: T.dim }}> / {v.usesTotal}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: T.mono, fontSize: 13 }}>
                      {v.pricePaid != null ? `${fmt(v.pricePaid)} €` : "—"}
                    </td>
                    <td style={{ ...td, fontSize: 13, color: T.muted }}>{PAYMENT_LABELS[v.paymentMethod] || v.paymentMethod}</td>
                    <td style={{ ...td, fontSize: 13, color: T.muted }}>{fmtDate(v.lastUsedAt)}</td>
                    <td style={td}>
                      {v.status === "completed"
                        ? <span style={{ ...badge, background: "#f1f5f9", color: T.dim }}>Completado</span>
                        : <span style={{ ...badge, background: "#dcfce7", color: "#15803d" }}>Activo</span>}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {v.usesLeft > 0 && (
                        <button style={{ ...btnSmall, marginRight: 6, color: "#fff", background: T.accent, border: "none", opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => act(v.id, "redeem")}>
                          Canjear 1
                        </button>
                      )}
                      {v.usesLeft < v.usesTotal && (
                        <button style={{ ...btnSmall, marginRight: 6, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => act(v.id, "undo")} title="Repone el último uso canjeado por error">
                          Deshacer
                        </button>
                      )}
                      <button style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => remove(v)} title="Eliminar bono">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewVoucherModal user={user} orgId={orgId} onClose={() => setShowNew(false)} onCreated={fetchVouchers} />}
    </div>
  )
}
