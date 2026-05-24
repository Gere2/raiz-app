"use client"

import { useState, useEffect } from "react"
import { Loader2, Download } from "lucide-react"
import { fetchInsights, type InsightsData, type SourceFilter } from "@/lib/insights-service"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"

type Period = "today" | "week" | "month" | "all"

const DAY_L: Record<number, string> = { 0: "Lun", 1: "Mar", 2: "Mié", 3: "Jue", 4: "Vie", 5: "Sáb", 6: "Dom" }
const SLOT_L: Record<string, string> = { early_morning: "< 9h", morning: "9–11h", mid_morning: "11–13h", lunch: "13–15h", afternoon: "15–17h", closing: "17h+" }
const SLOT_ORDER = ["early_morning", "morning", "mid_morning", "lunch", "afternoon", "closing"]
const W_EMOJI: Record<string, string> = { cold: "🥶", cool: "😎", mild: "🌤", warm: "☀️", hot: "🔥" }
const S_EMOJI: Record<string, string> = { winter: "❄️", spring: "🌸", summer: "☀️", autumn: "🍂" }
const P_EMOJI: Record<string, string> = { classes: "📚", exams: "📝", pre_exams: "😰", break: "🏖", summer_break: "🌴" }

const SOURCE_OPTIONS: { key: SourceFilter; label: string; emoji: string }[] = [
  { key: "all", label: "Todos", emoji: "📊" },
  { key: "POS", label: "POS", emoji: "💻" },
  { key: "APP", label: "App", emoji: "📱" },
]

function Bar({ label, value, max, fmt, bg }: { label: string; value: number; max: number; fmt?: string; bg: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 4) : 4
  const txt = fmt === "eur" ? `${value.toFixed(0)}€` : fmt === "avg" ? `${value.toFixed(2)}€` : String(value)
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: "#555" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{txt}</span>
      </div>
      <div style={{ height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: bg, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
    </div>
  )
}

function Section({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{
      backgroundColor: "#fff", borderRadius: 12, padding: 16, border: "1px solid #eee",
      gridColumn: full ? "1 / -1" : undefined,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  )
}

function KPI({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: "12px 8px", textAlign: "center", border: "1px solid #eee" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || "#111", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: "0.8px", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function exportCSV(data: InsightsData) {
  const rows: string[][] = []
  rows.push(["Raíz y Grano — Business Intelligence Report"])
  rows.push(["Generado", new Date().toLocaleString("es-ES")])
  rows.push([])

  // KPIs
  rows.push(["=== KPIs GENERALES ==="])
  rows.push(["Ingresos totales", `${data.totalRevenue.toFixed(2)}€`])
  rows.push(["Transacciones", String(data.totalTickets)])
  rows.push(["Ticket medio", `${data.avgTicket.toFixed(2)}€`])
  rows.push(["Items por pedido", data.avgItemsPerOrder.toFixed(1)])
  rows.push(["% multi-item", `${Math.round(data.multiItemRate * 100)}%`])
  rows.push(["Prep time APP (seg)", String(data.avgPrepTimeSecs)])
  rows.push([])

  // By source
  rows.push(["=== POR CANAL ==="])
  rows.push(["Canal", "Transacciones", "Ingresos", "Ticket medio"])
  for (const [src, s] of Object.entries(data.bySource)) {
    rows.push([src, String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // By payment
  rows.push(["=== MÉTODOS DE PAGO ==="])
  rows.push(["Método", "Transacciones", "Ingresos", "Ticket medio"])
  for (const [m, s] of Object.entries(data.byPayment)) {
    rows.push([m, String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // By time slot
  rows.push(["=== POR FRANJA HORARIA ==="])
  rows.push(["Franja", "Transacciones", "Ingresos", "Ticket medio"])
  for (const slot of SLOT_ORDER) {
    const s = data.byTimeSlot[slot]
    if (s) rows.push([SLOT_L[slot], String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // By day
  rows.push(["=== POR DÍA ==="])
  rows.push(["Día", "Transacciones", "Ingresos", "Ticket medio"])
  for (const [d, s] of Object.entries(data.byDayOfWeek)) {
    rows.push([DAY_L[Number(d)] || d, String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // Top products
  rows.push(["=== TOP PRODUCTOS ==="])
  rows.push(["Producto", "Unidades", "Ingresos"])
  for (const [name, s] of data.topProducts) {
    rows.push([name, String(s.count), `${s.revenue.toFixed(2)}€`])
  }
  rows.push([])

  // Categories
  rows.push(["=== POR CATEGORÍA ==="])
  rows.push(["Categoría", "Transacciones", "Ingresos", "Ticket medio"])
  for (const [cat, s] of Object.entries(data.byCategory)) {
    rows.push([cat, String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // Weather
  rows.push(["=== POR CLIMA ==="])
  rows.push(["Banda", "Transacciones", "Ingresos", "Ticket medio"])
  for (const [band, s] of Object.entries(data.byWeatherBand)) {
    rows.push([band, String(s.count), `${s.revenue.toFixed(2)}€`, `${s.avgTicket.toFixed(2)}€`])
  }
  rows.push([])

  // Weekly
  rows.push(["=== INGRESOS SEMANALES ==="])
  rows.push(["Semana", "Ingresos", "Transacciones"])
  for (const w of data.weeklyRevenue) {
    rows.push([w.week, `${w.revenue.toFixed(2)}€`, String(w.count)])
  }
  rows.push([])

  // Top combos
  rows.push(["=== TOP COMBINACIONES ==="])
  rows.push(["Combinación", "Frecuencia"])
  for (const [pair, count] of data.topPairs) {
    rows.push([pair, String(count)])
  }

  // Context insights
  rows.push([])
  rows.push(["=== INSIGHTS AUTOMÁTICOS ==="])
  for (const tip of data.contextInsights) {
    rows.push([tip.replace(/[^\w\sáéíóúñ€%.,–\-:()\/]/g, "")])
  }

  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `raiz-y-grano-insights-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function InsightsPanel() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)

  const [data, setData] = useState<InsightsData | null>(null)
  const [todayData, setTodayData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("all")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    const promises = [fetchInsights(orgId, period, sourceFilter)]
    if (period === "all") promises.push(fetchInsights(orgId, "today", sourceFilter))
    Promise.all(promises).then(([main, today]) => {
      setData(main)
      if (today) setTodayData(today)
    }).catch(console.error).finally(() => setLoading(false))
  }, [orgId, period, sourceFilter])

  if (!orgId) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#999" }}>Cargando organización...</span>
    </div>
  )

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 8 }}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#16a34a" }} />
      <span style={{ fontSize: 13, color: "#999" }}>Analizando datos...</span>
    </div>
  )
  if (!data) return null

  const slotData = SLOT_ORDER.filter(s => data.byTimeSlot[s]).map(s => ({ key: s, label: SLOT_L[s], ...data.byTimeSlot[s] }))
  const slotMax = Math.max(...slotData.map(s => s.count), 1)
  const slotAvgMax = Math.max(...slotData.map(s => s.avgTicket), 1)

  const dayData = Object.entries(data.byDayOfWeek).sort((a, b) => b[1].count - a[1].count).map(([k, v]) => ({ label: DAY_L[Number(k)] || k, ...v }))
  const dayMax = Math.max(...dayData.map(d => d.count), 1)

  const catEntries = Object.entries(data.byCategory).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6)
  const catMax = Math.max(...catEntries.map(e => e[1].revenue), 1)

  const weatherEntries = Object.entries(data.byWeatherBand).sort((a, b) => b[1].count - a[1].count)
  const weatherMax = Math.max(...weatherEntries.map(e => e[1].count), 1)

  const academicEntries = Object.entries(data.byAcademicPeriod).sort((a, b) => b[1].count - a[1].count)
  const academicMax = Math.max(...academicEntries.map(e => e[1].count), 1)

  const seasonEntries = Object.entries(data.bySeason).sort((a, b) => b[1].count - a[1].count)
  const seasonMax = Math.max(...seasonEntries.map(e => e[1].count), 1)

  const pairMax = data.topPairs.length > 0 ? data.topPairs[0][1] : 1
  const prepMin = data.avgPrepTimeSecs > 0 ? (Math.round(data.avgPrepTimeSecs / 6) / 10) : 0

  const payEntries = Object.entries(data.byPayment).sort((a, b) => b[1].count - a[1].count)
  const payMax = Math.max(...payEntries.map(e => e[1].count), 1)

  const wkMax = Math.max(...data.weeklyRevenue.map(w => w.revenue), 1)

  // Today comparison badges
  const todayBadges: { label: string; color: string; bg: string }[] = []
  if (todayData && period === "all" && todayData.totalTickets > 0) {
    const avgDailyRev = data.weeklyRevenue.length > 0
      ? data.totalRevenue / Math.max(Object.keys(data.byDayOfWeek).length * data.weeklyRevenue.length, 1)
      : data.totalRevenue / 30
    const todayRev = todayData.totalRevenue
    const pct = avgDailyRev > 0 ? Math.round(((todayRev - avgDailyRev) / avgDailyRev) * 100) : 0
    if (pct > 0) todayBadges.push({ label: `Hoy: ${todayRev.toFixed(0)}€ (+${pct}% vs media)`, color: "#15803d", bg: "#dcfce7" })
    else if (pct < 0) todayBadges.push({ label: `Hoy: ${todayRev.toFixed(0)}€ (${pct}% vs media)`, color: "#dc2626", bg: "#fef2f2" })
    else todayBadges.push({ label: `Hoy: ${todayRev.toFixed(0)}€ (= media)`, color: "#6b7280", bg: "#f3f4f6" })

    const todayTickets = todayData.totalTickets
    todayBadges.push({ label: `${todayTickets} tickets hoy`, color: "#1d4ed8", bg: "#eff6ff" })
    if (todayData.avgTicket > 0) todayBadges.push({ label: `Ticket: ${todayData.avgTicket.toFixed(2)}€`, color: "#7c3aed", bg: "#ede9fe" })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 40 }}>

      {/* Header row: Period + Source Filter + Export */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Period filter */}
          <div style={{ display: "flex", gap: 4, backgroundColor: "#f3f4f6", padding: 3, borderRadius: 10 }}>
            {([
              { key: "today" as Period, label: "Hoy" }, { key: "week" as Period, label: "7d" },
              { key: "month" as Period, label: "30d" }, { key: "all" as Period, label: "Todo" },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)} style={{
                padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                backgroundColor: period === key ? "#fff" : "transparent",
                color: period === key ? "#111" : "#888",
                boxShadow: period === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{label}</button>
            ))}
          </div>

          {/* Source filter */}
          <div style={{ display: "flex", gap: 4, backgroundColor: "#ecfdf5", padding: 3, borderRadius: 10 }}>
            {SOURCE_OPTIONS.map(({ key, label, emoji }) => (
              <button key={key} onClick={() => setSourceFilter(key)} style={{
                padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                backgroundColor: sourceFilter === key ? "#fff" : "transparent",
                color: sourceFilter === key ? "#065f46" : "#6b7280",
                boxShadow: sourceFilter === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{emoji} {label}</button>
            ))}
          </div>
        </div>

        <button onClick={() => exportCSV(data)} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8, fontSize: 12,
          fontWeight: 600, border: "1px solid #d1d5db", backgroundColor: "#fff", cursor: "pointer", color: "#374151",
        }}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Active filter badge */}
      {sourceFilter !== "all" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, backgroundColor: sourceFilter === "POS" ? "#dbeafe" : "#ede9fe",
            color: sourceFilter === "POS" ? "#1d4ed8" : "#7c3aed",
            padding: "3px 10px", borderRadius: 20, fontWeight: 600,
          }}>
            Filtrando: solo {sourceFilter === "POS" ? "💻 POS" : "📱 App"}
          </span>
          <button onClick={() => setSourceFilter("all")} style={{
            fontSize: 11, color: "#9ca3af", cursor: "pointer", background: "none", border: "none", textDecoration: "underline",
          }}>
            Ver todos
          </button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <KPI value={`${data.totalRevenue.toFixed(0)}€`} label="Ingresos" accent="#16a34a" />
        <KPI value={String(data.totalTickets)} label="Transacciones" />
        <KPI value={`${data.avgTicket.toFixed(2)}€`} label="Ticket medio" />
      </div>

      {/* Today comparison badges */}
      {todayBadges.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {todayBadges.map(b => (
            <span key={b.label} style={{ fontSize: 11, backgroundColor: b.bg, color: b.color, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{b.label}</span>
          ))}
        </div>
      )}

      {/* Quick badges */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { t: `📦 ${data.avgItemsPerOrder.toFixed(1)} items/pedido`, bg: "#eff6ff", c: "#2563eb" },
          { t: `🔀 ${Math.round(data.multiItemRate * 100)}% multi-item`, bg: "#fef3c7", c: "#d97706" },
          { t: `💻 POS: ${data.bySource?.POS?.count || 0} | 📱 APP: ${data.bySource?.APP?.count || 0}`, bg: "#f0fdf4", c: "#16a34a" },
          ...(prepMin > 0 ? [{ t: `⏱ Prep APP: ${prepMin}min`, bg: "#ede9fe", c: "#7c3aed" }] : []),
        ].map(({ t, bg, c }) => (
          <span key={t} style={{ fontSize: 11, backgroundColor: bg, color: c, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{t}</span>
        ))}
      </div>

      {/* Context insights */}
      {data.contextInsights.length > 0 && (
        <div style={{ backgroundColor: "#fefce8", border: "1px solid #fde68a", borderRadius: 12, padding: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>💡 Insights clave</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.contextInsights.map((tip, i) => (
              <div key={i} style={{ fontSize: 12, color: "#78350f", lineHeight: 1.4 }}>{tip}</div>
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

        <Section title="🕐 Ventas por franja">
          {slotData.map(s => <Bar key={s.key} label={s.label} value={s.count} max={slotMax} bg="#f59e0b" />)}
        </Section>

        <Section title="📅 Ventas por día">
          {dayData.map(d => <Bar key={d.label} label={d.label} value={d.count} max={dayMax} bg="#3b82f6" />)}
        </Section>

        <Section title="💰 Ticket medio por franja">
          {slotData.map(s => <Bar key={s.key} label={s.label} value={s.avgTicket} max={slotAvgMax} fmt="avg" bg="#10b981" />)}
        </Section>

        <Section title="💳 Métodos de pago">
          {payEntries.map(([method, stats]) => (
            <div key={method} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: "#555" }}>{method === "CARD" ? "💳 Tarjeta" : method === "CASH" ? "💶 Efectivo" : method}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{stats.count} ({stats.revenue.toFixed(0)}€)</span>
              </div>
              <div style={{ height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max((stats.count / payMax) * 100, 4)}%`, backgroundColor: method === "CARD" ? "#8b5cf6" : "#f59e0b", borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Ticket medio: {stats.avgTicket.toFixed(2)}€</div>
            </div>
          ))}
        </Section>

        <Section title="🏆 Top productos">
          {data.topProducts.map(([name, stats], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: i < data.topProducts.length - 1 ? "1px solid #f5f5f5" : "none" }}>
              <span style={{
                width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, flexShrink: 0,
                backgroundColor: i === 0 ? "#fef3c7" : i === 1 ? "#f3f4f6" : i === 2 ? "#fed7aa" : "#fafafa",
                color: i === 0 ? "#b45309" : i === 1 ? "#4b5563" : i === 2 ? "#c2410c" : "#aaa",
              }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 11, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#111", flexShrink: 0 }}>{stats.count}</span>
              <span style={{ fontSize: 10, color: "#999", flexShrink: 0, width: 40, textAlign: "right" }}>{stats.revenue.toFixed(0)}€</span>
            </div>
          ))}
        </Section>

        <Section title="🔗 Top combinaciones">
          {data.topPairs.length === 0 ? (
            <p style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: 16 }}>Sin datos</p>
          ) : data.topPairs.map(([pair, count]) => <Bar key={pair} label={pair} value={count} max={pairMax} bg="#22c55e" />)}
        </Section>

        <Section title="📂 Ingresos por categoría">
          {catEntries.map(([cat, stats]) => <Bar key={cat} label={cat} value={Math.round(stats.revenue)} max={catMax} fmt="eur" bg="#a855f7" />)}
        </Section>

        <Section title="🌡 Ventas por clima">
          {weatherEntries.map(([band, stats]) => (
            <div key={band} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: "#555" }}>{W_EMOJI[band] || ""} {band}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{stats.count} · {stats.avgTicket.toFixed(2)}€/ticket</span>
              </div>
              <div style={{ height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max((stats.count / weatherMax) * 100, 4)}%`, backgroundColor: "#06b6d4", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </Section>

        <Section title="🎓 Período académico">
          {academicEntries.map(([p, stats]) => <Bar key={p} label={`${P_EMOJI[p] || ""} ${p}`} value={stats.count} max={academicMax} bg="#f43f5e" />)}
        </Section>

        <Section title="🗓 Por estación">
          {seasonEntries.map(([s, stats]) => <Bar key={s} label={`${S_EMOJI[s] || ""} ${s}`} value={stats.count} max={seasonMax} bg="#f97316" />)}
        </Section>

        {data.weeklyRevenue.length > 1 && (
          <Section title="📊 Ingresos por semana" full>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
              {data.weeklyRevenue.map(w => (
                <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: "100%", backgroundColor: "#3b82f6", borderRadius: 3,
                    height: `${Math.max((w.revenue / wkMax) * 70, 4)}px`,
                    transition: "height 0.3s",
                  }} />
                  <span style={{ fontSize: 9, color: "#999", marginTop: 3 }}>{w.week}</span>
                  <span style={{ fontSize: 8, color: "#bbb" }}>{w.revenue.toFixed(0)}€</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
