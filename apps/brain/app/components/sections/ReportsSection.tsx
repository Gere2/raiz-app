"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { T, page, pageTitle, pageSub, tableWrap, tableHead, btnSmall } from "../theme"
import { Overlay } from "../ui"

type Report = {
  id: string
  type: string       // "bug" | "improvement" | "other"
  description: string
  page: string
  source: string     // "APP"
  userId: string
  userEmail: string
  userName: string
  status: string     // "new" | "reviewed" | "resolved" | "dismissed"
  notes?: string
  createdAt: string
}

interface Props {
  user: User
  orgId: string
}

const STATUS_OPTIONS = [
  { value: "new", label: "Nuevo", emoji: "🆕", bg: "#eff6ff", color: "#1d4ed8" },
  { value: "reviewed", label: "Revisado", emoji: "👀", bg: "#fefce8", color: "#a16207" },
  { value: "resolved", label: "Resuelto", emoji: "✅", bg: "#f0fdf4", color: "#15803d" },
  { value: "dismissed", label: "Descartado", emoji: "🚫", bg: "#fef2f2", color: "#b91c1c" },
]

const TYPE_CONFIG: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
  bug: { label: "Bug", emoji: "🐛", bg: "#fef2f2", color: "#b91c1c" },
  improvement: { label: "Mejora", emoji: "💡", bg: "#fefce8", color: "#a16207" },
  other: { label: "Otro", emoji: "💬", bg: "#eff6ff", color: "#1d4ed8" },
}

const FILTER_TABS = [
  { value: "", label: "Todos" },
  { value: "new", label: "Nuevos" },
  { value: "reviewed", label: "Revisados" },
  { value: "resolved", label: "Resueltos" },
  { value: "dismissed", label: "Descartados" },
]

export default function ReportsSection({ user, orgId }: Props) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [selected, setSelected] = useState<Report | null>(null)
  const [editStatus, setEditStatus] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/reports`)
      const d = await r.json()
      setReports(d.reports || [])
    } catch (e) {
      console.error("Error fetching reports:", e)
    }
    setLoading(false)
  }, [user, orgId])

  useEffect(() => { fetchReports() }, [fetchReports])

  const filtered = reports.filter(r => {
    if (filter && r.status !== filter) return false
    if (typeFilter && r.type !== typeFilter) return false
    return true
  })

  const counts = {
    all: reports.length,
    new: reports.filter(r => r.status === "new").length,
    reviewed: reports.filter(r => r.status === "reviewed").length,
    resolved: reports.filter(r => r.status === "resolved").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  }

  const openDetail = (report: Report) => {
    setSelected(report)
    setEditStatus(report.status)
    setEditNotes(report.notes || "")
  }

  const updateReport = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await authedFetch(user, `/api/org/${orgId}/reports/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, notes: editNotes }),
      })
      setReports(prev => prev.map(r =>
        r.id === selected.id ? { ...r, status: editStatus, notes: editNotes } : r
      ))
      setSelected(null)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const deleteReport = async (id: string) => {
    if (!confirm("¿Eliminar este reporte?")) return
    try {
      await authedFetch(user, `/api/org/${orgId}/reports/${id}`, { method: "DELETE" })
      setReports(prev => prev.filter(r => r.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch (e) { console.error(e) }
  }

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    } catch { return iso }
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={pageTitle}>Mejoras y Reportes</h1>
          <p style={pageSub}>Feedback de usuarios desde la app</p>
        </div>
        <button onClick={fetchReports} style={{ ...btnSmall, fontSize: 12 }}>
          🔄 Refrescar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Nuevos", value: counts.new, color: "#1d4ed8", bg: "#eff6ff" },
          { label: "Revisados", value: counts.reviewed, color: "#a16207", bg: "#fefce8" },
          { label: "Resueltos", value: counts.resolved, color: "#15803d", bg: "#f0fdf4" },
          { label: "Total", value: counts.all, color: T.text, bg: T.surface },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: T.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTER_TABS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontFamily: T.font,
              border: `1px solid ${filter === f.value ? T.accent : T.border}`,
              background: filter === f.value ? T.accent + "14" : T.surface,
              color: filter === f.value ? T.accent : T.muted,
              cursor: "pointer", fontWeight: filter === f.value ? 600 : 400,
            }}
          >
            {f.label}
            <span style={{ opacity: 0.5, marginLeft: 4 }}>
              {f.value === "" ? counts.all : counts[f.value as keyof typeof counts] || 0}
            </span>
          </button>
        ))}

        <span style={{ color: T.dim, fontSize: 12, margin: "0 4px" }}>|</span>

        {Object.entries(TYPE_CONFIG).map(([val, cfg]) => (
          <button
            key={val}
            onClick={() => setTypeFilter(typeFilter === val ? "" : val)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontFamily: T.font,
              border: `1px solid ${typeFilter === val ? cfg.color + "60" : T.border}`,
              background: typeFilter === val ? cfg.bg : T.surface,
              color: typeFilter === val ? cfg.color : T.muted,
              cursor: "pointer", fontWeight: typeFilter === val ? 600 : 400,
            }}
          >
            {cfg.emoji} {cfg.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={tableWrap}>
        <div style={{ ...tableHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Reportes ({filtered.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: T.dim }}>
            {reports.length === 0 ? "No hay reportes aún" : "Ningún reporte coincide con los filtros"}
          </div>
        ) : (
          filtered.map(report => {
            const typeConf = TYPE_CONFIG[report.type] || TYPE_CONFIG.other
            const statusConf = STATUS_OPTIONS.find(s => s.value === report.status) || STATUS_OPTIONS[0]
            return (
              <div
                key={report.id}
                onClick={() => openDetail(report)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 100px 120px 40px",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: `1px solid ${T.borderLight}`,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = T.surfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Type badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                  background: typeConf.bg, color: typeConf.color, whiteSpace: "nowrap",
                }}>
                  {typeConf.emoji} {typeConf.label}
                </span>

                {/* Description + meta */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {report.description}
                  </div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                    {report.userName || report.userEmail || "Anónimo"} · {report.page} · {formatDate(report.createdAt)}
                  </div>
                </div>

                {/* Status badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                  background: statusConf.bg, color: statusConf.color, textAlign: "center",
                }}>
                  {statusConf.emoji} {statusConf.label}
                </span>

                {/* Source */}
                <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>
                  {report.source}
                </span>

                {/* Delete */}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteReport(report.id) }}
                  style={{ fontSize: 14, cursor: "pointer", border: "none", background: "none", color: "#dc2626" }}
                  title="Eliminar"
                >
                  🗑
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Detail / Edit modal */}
      {selected && (
        <Overlay onClose={() => setSelected(null)}>
          <div style={{ minWidth: 460 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
                background: (TYPE_CONFIG[selected.type] || TYPE_CONFIG.other).bg,
                color: (TYPE_CONFIG[selected.type] || TYPE_CONFIG.other).color,
              }}>
                {(TYPE_CONFIG[selected.type] || TYPE_CONFIG.other).emoji} {(TYPE_CONFIG[selected.type] || TYPE_CONFIG.other).label}
              </span>
              <span style={{ fontSize: 12, color: T.dim }}>{formatDate(selected.createdAt)}</span>
            </div>

            {/* Description */}
            <div style={{
              background: T.bg, borderRadius: 12, padding: 16, marginBottom: 16,
              border: `1px solid ${T.border}`, fontSize: 14, lineHeight: 1.6, color: T.text,
            }}>
              {selected.description}
            </div>

            {/* Meta */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, fontSize: 13 }}>
              <div>
                <span style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>USUARIO</span>
                <div style={{ color: T.text, marginTop: 2 }}>{selected.userName || selected.userEmail || "—"}</div>
              </div>
              <div>
                <span style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>PÁGINA</span>
                <div style={{ color: T.text, marginTop: 2, fontFamily: T.mono, fontSize: 12 }}>{selected.page || "—"}</div>
              </div>
              <div>
                <span style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>EMAIL</span>
                <div style={{ color: T.text, marginTop: 2, fontSize: 12 }}>{selected.userEmail || "—"}</div>
              </div>
              <div>
                <span style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>ORIGEN</span>
                <div style={{ color: T.text, marginTop: 2 }}>{selected.source}</div>
              </div>
            </div>

            {/* Status selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: T.dim, fontWeight: 600, display: "block", marginBottom: 8 }}>ESTADO</label>
              <div style={{ display: "flex", gap: 8 }}>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setEditStatus(s.value)}
                    style={{
                      flex: 1, padding: "8px 6px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                      border: `2px solid ${editStatus === s.value ? s.color : T.border}`,
                      background: editStatus === s.value ? s.bg : T.surface,
                      color: editStatus === s.value ? s.color : T.muted,
                      cursor: "pointer", fontFamily: T.font, textAlign: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: T.dim, fontWeight: 600, display: "block", marginBottom: 8 }}>NOTAS INTERNAS</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Notas del equipo sobre este reporte..."
                rows={3}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${T.border}`, background: T.surface,
                  color: T.text, fontFamily: T.font, fontSize: 13,
                  outline: "none", resize: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Save */}
            <button
              onClick={updateReport}
              disabled={saving}
              style={{
                width: "100%", padding: "12px 20px", borderRadius: 10,
                border: "none", background: T.accent, color: "#fff",
                fontFamily: T.font, fontSize: 14, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1, transition: "opacity 0.15s",
              }}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}
