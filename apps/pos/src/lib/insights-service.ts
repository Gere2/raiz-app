/**
 * insights-service.ts v4
 * Métricas de negocio con análisis avanzado para franquicia.
 * Reads from org-scoped tickets (POS) + root orders (APP).
 * Supports source filtering: "all" | "POS" | "APP".
 */

import { collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore"
import { db } from "./firebase"

export type SourceFilter = "all" | "POS" | "APP"

export interface SlotStats { count: number; revenue: number; avgTicket: number }
export interface InsightsData {
  totalTickets: number
  totalRevenue: number
  avgTicket: number
  byTimeSlot: Record<string, SlotStats>
  byDayOfWeek: Record<number, SlotStats>
  byCategory: Record<string, SlotStats>
  byWeatherBand: Record<string, SlotStats>
  byAcademicPeriod: Record<string, SlotStats>
  bySeason: Record<string, SlotStats>
  bySource: Record<string, SlotStats>
  byPayment: Record<string, SlotStats>
  topPairs: [string, number][]
  topProducts: [string, { count: number; revenue: number }][]
  weeklyRevenue: { week: string; revenue: number; count: number }[]
  avgPrepTimeSecs: number
  multiItemRate: number
  avgItemsPerOrder: number
  weatherCorrelation: { band: string; avgTicket: number; count: number }[]
  slotAvgTicket: { slot: string; avgTicket: number; count: number }[]
  busyHeatmap: Record<string, Record<string, number>>
  contextInsights: string[]
}

function inc(obj: Record<string, any>, key: string, total: number) {
  if (!obj[key]) obj[key] = { count: 0, revenue: 0, avgTicket: 0 }
  obj[key].count++
  obj[key].revenue += total
}
function finalize(obj: Record<string, any>) {
  for (const k of Object.keys(obj)) {
    obj[k].avgTicket = obj[k].count > 0 ? obj[k].revenue / obj[k].count : 0
  }
}

function isValidCategory(cat: string): boolean {
  if (!cat || cat.length > 30) return false
  if (cat.startsWith("sin ")) return false
  if (/^[a-zA-Z0-9]{15,}$/.test(cat)) return false
  return true
}

export async function fetchInsights(
  orgId: string,
  period: "today" | "week" | "month" | "all" = "all",
  sourceFilter: SourceFilter = "all",
): Promise<InsightsData> {
  if (!db) throw new Error("Firestore no inicializado")
  if (!orgId) throw new Error("orgId requerido")

  const now = new Date()
  let cutoff = new Date(0)
  if (period === "today") cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === "week") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (period === "month") cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const toDate = (v: any): Date => {
    if (!v) return new Date(0)
    if (v instanceof Timestamp) return v.toDate()
    if (v.toDate) return v.toDate()
    return new Date(v)
  }

  const allDocs: any[] = []

  // ── Fetch POS tickets from org-scoped collection ──
  if (sourceFilter === "all" || sourceFilter === "POS") {
    const ticketsSnap = await getDocs(
      query(collection(db, "orgs", orgId, "tickets"), orderBy("ticketNumber", "desc"))
    )
    ticketsSnap.forEach(doc => {
      const d = doc.data()
      const date = toDate(d.createdAt || d.date)
      if (date >= cutoff) {
        allDocs.push({ ...d, _date: date, source: d.source || "POS" })
      }
    })
  }

  // ── Fetch APP orders from root orders collection ──
  if (sourceFilter === "all" || sourceFilter === "APP") {
    const ordersSnap = await getDocs(
      query(collection(db, "orders"), where("source", "==", "APP"))
    )
    ordersSnap.forEach(doc => {
      const d = doc.data()
      const date = toDate(d.createdAt)
      if (date >= cutoff) {
        allDocs.push({ ...d, _date: date, source: "APP" })
      }
    })
  }

  const r: InsightsData = {
    totalTickets: allDocs.length, totalRevenue: 0, avgTicket: 0,
    byTimeSlot: {}, byDayOfWeek: {}, byCategory: {},
    byWeatherBand: {}, byAcademicPeriod: {}, bySeason: {},
    bySource: {}, byPayment: {}, topPairs: [], topProducts: [],
    weeklyRevenue: [], avgPrepTimeSecs: 0, multiItemRate: 0,
    avgItemsPerOrder: 0, weatherCorrelation: [], slotAvgTicket: [],
    busyHeatmap: {}, contextInsights: [],
  }

  let multiItems = 0, prepTimeTotal = 0, prepTimeCount = 0, totalItems = 0
  const pairMap: Record<string, number> = {}
  const productMap: Record<string, { count: number; revenue: number }> = {}
  const weekMap: Record<string, { revenue: number; count: number }> = {}

  for (const d of allDocs) {
    const total = d.total || 0
    r.totalRevenue += total
    totalItems += d.itemCount || 0

    if (d.timeSlot) inc(r.byTimeSlot, d.timeSlot, total)
    if (d.dayOfWeek !== undefined) inc(r.byDayOfWeek, d.dayOfWeek, total)
    if (d.weatherBand) inc(r.byWeatherBand, d.weatherBand, total)
    if (d.academicPeriod) inc(r.byAcademicPeriod, d.academicPeriod, total)
    if (d.season) inc(r.bySeason, d.season, total)
    if (d.source) inc(r.bySource, d.source, total)
    if (d.paymentMethod) inc(r.byPayment, d.paymentMethod, total)

    const cats = (d.categoryNames || []).filter(isValidCategory)
    for (const cat of cats) inc(r.byCategory, cat, total / Math.max(cats.length, 1))

    for (const pair of (d.itemPairs || [])) pairMap[pair] = (pairMap[pair] || 0) + 1

    const items = d.items || []
    for (const item of items) {
      const name = item.product?.name || item.productName || item.name
      if (name) {
        if (!productMap[name]) productMap[name] = { count: 0, revenue: 0 }
        const qty = item.quantity || item.qty || 1
        productMap[name].count += qty
        productMap[name].revenue += (item.product?.price || item.unitPrice || item.price || 0) * qty
      }
    }

    if (d.hasMultipleItems) multiItems++
    if (d.preparationTimeSecs && d.preparationTimeSecs > 0 && d.preparationTimeSecs < 1800) {
      prepTimeTotal += d.preparationTimeSecs; prepTimeCount++
    }

    // Weekly revenue
    if (d._date) {
      const wk = `S${d.weekNumber || getWeek(d._date)}`
      if (!weekMap[wk]) weekMap[wk] = { revenue: 0, count: 0 }
      weekMap[wk].revenue += total; weekMap[wk].count++
    }

    // Heatmap: day x timeSlot
    if (d.dayOfWeek !== undefined && d.timeSlot) {
      const dayKey = String(d.dayOfWeek)
      if (!r.busyHeatmap[dayKey]) r.busyHeatmap[dayKey] = {}
      r.busyHeatmap[dayKey][d.timeSlot] = (r.busyHeatmap[dayKey][d.timeSlot] || 0) + 1
    }
  }

  // Finalize averages
  finalize(r.byTimeSlot); finalize(r.byDayOfWeek); finalize(r.byWeatherBand)
  finalize(r.byAcademicPeriod); finalize(r.bySeason); finalize(r.bySource)
  finalize(r.byPayment); finalize(r.byCategory)

  r.avgTicket = r.totalTickets > 0 ? r.totalRevenue / r.totalTickets : 0
  r.multiItemRate = r.totalTickets > 0 ? multiItems / r.totalTickets : 0
  r.avgPrepTimeSecs = prepTimeCount > 0 ? Math.round(prepTimeTotal / prepTimeCount) : 0
  r.avgItemsPerOrder = r.totalTickets > 0 ? totalItems / r.totalTickets : 0

  r.topPairs = Object.entries(pairMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
  r.topProducts = Object.entries(productMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8)

  r.weeklyRevenue = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => ({ week: w, ...v }))

  r.weatherCorrelation = Object.entries(r.byWeatherBand)
    .map(([band, s]) => ({ band, avgTicket: s.avgTicket, count: s.count }))
    .sort((a, b) => b.avgTicket - a.avgTicket)

  r.slotAvgTicket = Object.entries(r.byTimeSlot)
    .map(([slot, s]) => ({ slot, avgTicket: s.avgTicket, count: s.count }))
    .sort((a, b) => b.avgTicket - a.avgTicket)

  // Generate context insights
  r.contextInsights = generateInsights(r)

  return r
}

function getWeek(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

function generateInsights(d: InsightsData): string[] {
  const tips: string[] = []
  const DAY_NAMES: Record<number, string> = { 0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo" }
  const SLOT_NAMES: Record<string, string> = { early_morning: "antes de las 9h", morning: "9–11h", mid_morning: "11–13h", lunch: "13–15h", afternoon: "15–17h", closing: "después de las 17h" }

  // Best day
  const bestDay = Object.entries(d.byDayOfWeek).sort((a, b) => b[1].revenue - a[1].revenue)[0]
  if (bestDay) tips.push(`📈 ${DAY_NAMES[Number(bestDay[0])]} es el día más fuerte: ${bestDay[1].revenue.toFixed(0)}€ (${bestDay[1].count} tickets)`)

  // Best time slot
  const bestSlot = Object.entries(d.byTimeSlot).sort((a, b) => b[1].count - a[1].count)[0]
  if (bestSlot) tips.push(`⏰ Hora punta: ${SLOT_NAMES[bestSlot[0]] || bestSlot[0]} con ${bestSlot[1].count} transacciones`)

  // Highest avg ticket slot
  const highAvgSlot = d.slotAvgTicket[0]
  if (highAvgSlot && highAvgSlot.count > 5) tips.push(`💰 Mayor ticket medio (${highAvgSlot.avgTicket.toFixed(2)}€) ${SLOT_NAMES[highAvgSlot.slot] || highAvgSlot.slot}`)

  // Weather
  const coldData = d.byWeatherBand["cold"]
  const mildData = d.byWeatherBand["mild"]
  if (coldData && mildData) {
    if (coldData.avgTicket > mildData.avgTicket) tips.push(`🥶 Días fríos → ticket medio ${coldData.avgTicket.toFixed(2)}€ vs ${mildData.avgTicket.toFixed(2)}€ en días templados`)
  }

  // Multi-item
  if (d.multiItemRate > 0.3) tips.push(`🔗 ${Math.round(d.multiItemRate * 100)}% de clientes compran más de 1 producto — oportunidad para combos`)
  else if (d.multiItemRate < 0.2) tips.push(`⚡ Solo ${Math.round(d.multiItemRate * 100)}% compran múltiples items — considerar menús combo`)

  // Payment
  const card = d.byPayment["CARD"]
  const cash = d.byPayment["CASH"]
  if (card && cash) {
    const cardPct = Math.round((card.count / (card.count + cash.count)) * 100)
    tips.push(`💳 ${cardPct}% paga con tarjeta (ticket medio ${card.avgTicket.toFixed(2)}€) vs ${cash.avgTicket.toFixed(2)}€ en efectivo`)
  }

  // Source
  const pos = d.bySource["POS"]
  const app = d.bySource["APP"]
  if (pos && app) {
    const appPct = Math.round((app.count / (pos.count + app.count)) * 100)
    tips.push(`📱 APP representa ${appPct}% de pedidos con ticket medio ${app.avgTicket.toFixed(2)}€`)
  }

  return tips
}
