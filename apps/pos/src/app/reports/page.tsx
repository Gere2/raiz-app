"use client"

import { useEffect, useState, useMemo } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import {
  TrendingUp, TrendingDown, Calendar, CreditCard, Banknote,
  ChevronLeft, ChevronRight, Download, Filter,
} from "lucide-react"

type OrderRecord = {
  id: string
  source: string
  status: string
  total: number
  items: { productName: string; name?: string; qty: number; quantity?: number; unitPrice: number; price?: number }[]
  paymentMethod: string
  paymentStatus: string
  customerName: string
  createdAt: number // millis
}

type DaySummary = {
  date: string
  label: string
  revenue: number
  orders: number
  cardRevenue: number
  cashRevenue: number
  appOrders: number
  posOrders: number
  avgTicket: number
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
}

function getTimestamp(data: any): number {
  return data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.date?.toMillis?.() || data.date?.seconds * 1000 || 0
}

export default function ReportsPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <ReportsContent />
    </RoleGuard>
  )
}

function ReportsContent() {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<"week" | "month" | "custom">("week")
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return formatDate(d)
  })
  const [endDate, setEndDate] = useState(() => formatDate(new Date()))
  const [showDetails, setShowDetails] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [ordSnap, teachSnap, ticketsSnap] = await Promise.all([
          getDocs(collection(db, "orders")),
          getDocs(collection(db, "teacher_orders")),
          getDocs(collection(db, "tickets")),
        ])

        const appOrders: OrderRecord[] = ordSnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            source: data.source || "APP",
            status: data.status || "",
            total: data.total || data.items?.reduce((s: number, i: any) => s + (i.unitPrice || 0) * (i.qty || 0), 0) || 0,
            items: data.items || [],
            paymentMethod: data.paymentMethod || "CARD",
            paymentStatus: data.paymentStatus || "",
            customerName: data.customerName || "",
            createdAt: getTimestamp(data),
          }
        })

        const teacherOrders: OrderRecord[] = teachSnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            source: "TEACHER",
            status: data.status || "",
            total: data.total || 0,
            items: data.items || [],
            paymentMethod: "TEACHER",
            paymentStatus: "",
            customerName: data.teacherName || "",
            createdAt: getTimestamp(data),
          }
        })

        const posTickets: OrderRecord[] = ticketsSnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            source: "POS",
            status: "COMPLETED",
            total: data.total || 0,
            items: (data.items || []).map((item: any) => ({
              productName: item.name || item.productName || "Producto",
              name: item.name || item.productName || "Producto",
              qty: item.quantity || item.qty || 1,
              quantity: item.quantity || item.qty || 1,
              unitPrice: item.price || item.unitPrice || 0,
              price: item.price || item.unitPrice || 0,
            })),
            paymentMethod: data.paymentMethod || "CASH",
            paymentStatus: "PAID",
            customerName: data.userName || "",
            createdAt: getTimestamp(data),
          }
        })

        setOrders([...appOrders, ...teacherOrders, ...posTickets])
      } catch (err) {
        console.error("Error:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const setPeriodDates = (p: "week" | "month" | "custom") => {
    setPeriod(p)
    const now = new Date()
    if (p === "week") {
      const start = new Date(); start.setDate(now.getDate() - 6)
      setStartDate(formatDate(start)); setEndDate(formatDate(now))
    } else if (p === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setStartDate(formatDate(start)); setEndDate(formatDate(now))
    }
  }

  const shiftDates = (dir: number) => {
    const s = new Date(startDate + "T12:00:00")
    const e = new Date(endDate + "T12:00:00")
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
    s.setDate(s.getDate() + dir * days)
    e.setDate(e.getDate() + dir * days)
    setStartDate(formatDate(s)); setEndDate(formatDate(e)); setPeriod("custom")
  }

  const filteredOrders = useMemo(() => {
    const startMs = new Date(startDate + "T00:00:00").getTime()
    const endMs = new Date(endDate + "T23:59:59").getTime()
    return orders.filter((o) => o.createdAt >= startMs && o.createdAt <= endMs)
  }, [orders, startDate, endDate])

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0)
  const totalOrders = filteredOrders.length
  const cardRevenue = filteredOrders.filter((o) => o.paymentMethod === "CARD").reduce((s, o) => s + o.total, 0)
  const cashRevenue = filteredOrders.filter((o) => o.paymentMethod === "CASH").reduce((s, o) => s + o.total, 0)
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Daily breakdown
  const dailySummaries = useMemo(() => {
    const map = new Map<string, DaySummary>()
    const s = new Date(startDate + "T12:00:00")
    const e = new Date(endDate + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const key = formatDate(d)
      map.set(key, { date: key, label: dateLabel(key), revenue: 0, orders: 0, cardRevenue: 0, cashRevenue: 0, appOrders: 0, posOrders: 0, avgTicket: 0 })
    }
    filteredOrders.forEach((o) => {
      const key = formatDate(new Date(o.createdAt))
      const day = map.get(key)
      if (day) {
        day.revenue += o.total; day.orders++
        if (o.paymentMethod === "CARD") day.cardRevenue += o.total
        if (o.paymentMethod === "CASH") day.cashRevenue += o.total
        if (o.source === "APP") day.appOrders++; else day.posOrders++
      }
    })
    map.forEach((day) => { day.avgTicket = day.orders > 0 ? day.revenue / day.orders : 0 })
    return Array.from(map.values()).reverse()
  }, [filteredOrders, startDate, endDate])

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    filteredOrders.forEach((o) => {
      o.items?.forEach((item) => {
        const key = item.productName || item.name || "?"
        const existing = map.get(key) || { name: key, qty: 0, revenue: 0 }
        existing.qty += item.qty || item.quantity || 1
        existing.revenue += (item.unitPrice || item.price || 0) * (item.qty || item.quantity || 1)
        map.set(key, existing)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10)
  }, [filteredOrders])

  const maxRevenue = Math.max(...dailySummaries.map((d) => d.revenue), 1)

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Historial de ventas</h1>
        </div>

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-gray-100 p-1">
            {(["week", "month", "custom"] as const).map((p) => (
              <button key={p} onClick={() => setPeriodDates(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${period === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {p === "week" ? "7 días" : p === "month" ? "Este mes" : "Personalizado"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftDates(-1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><ChevronLeft className="h-5 w-5" /></button>
            <div className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-1.5">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPeriod("custom") }} className="text-xs text-gray-700 border-none outline-none bg-transparent" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPeriod("custom") }} className="text-xs text-gray-700 border-none outline-none bg-transparent" />
            </div>
            <button onClick={() => shiftDates(1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /></div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="Ingresos" value={`${totalRevenue.toFixed(2)} €`} icon={<TrendingUp className="h-4 w-4 text-green-600" />} bg="bg-green-50 border-green-200" />
              <SummaryCard label="Pedidos" value={totalOrders.toString()} icon={<Filter className="h-4 w-4 text-blue-600" />} bg="bg-blue-50 border-blue-200" />
              <SummaryCard label="Tarjeta" value={`${cardRevenue.toFixed(2)} €`} icon={<CreditCard className="h-4 w-4 text-violet-600" />} bg="bg-violet-50 border-violet-200" />
              <SummaryCard label="Efectivo" value={`${cashRevenue.toFixed(2)} €`} icon={<Banknote className="h-4 w-4 text-amber-600" />} bg="bg-amber-50 border-amber-200" />
              <SummaryCard label="Ticket medio" value={`${avgTicket.toFixed(2)} €`} icon={<TrendingUp className="h-4 w-4 text-pink-600" />} bg="bg-pink-50 border-pink-200" />
            </div>

            {/* Revenue chart (bars) */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">📊 Ingresos por día</h3>
              <div className="space-y-2">
                {dailySummaries.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => setShowDetails(showDetails === day.date ? null : day.date)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{day.label}</span>
                      <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                        {day.revenue > 0 && (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 bg-green-500 rounded-lg transition-all duration-500"
                              style={{ width: `${(day.cardRevenue / maxRevenue) * 100}%` }}
                            />
                            <div
                              className="absolute inset-y-0 bg-amber-400 rounded-r-lg transition-all duration-500"
                              style={{ left: `${(day.cardRevenue / maxRevenue) * 100}%`, width: `${(day.cashRevenue / maxRevenue) * 100}%` }}
                            />
                          </>
                        )}
                        <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-gray-700 z-10">
                          {day.revenue > 0 ? `${day.revenue.toFixed(2)} €` : "—"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right shrink-0">{day.orders} ped</span>
                    </div>
                    {showDetails === day.date && day.orders > 0 && (
                      <div className="mt-2 ml-[calc(5rem+12px)] grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                        <span>💳 Tarjeta: <b className="text-gray-700">{day.cardRevenue.toFixed(2)} €</b></span>
                        <span>💶 Efectivo: <b className="text-gray-700">{day.cashRevenue.toFixed(2)} €</b></span>
                        <span>📱 App: <b className="text-gray-700">{day.appOrders}</b></span>
                        <span>☕ POS: <b className="text-gray-700">{day.posOrders}</b></span>
                        <span>🎫 Ticket medio: <b className="text-gray-700">{day.avgTicket.toFixed(2)} €</b></span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-500" /> Tarjeta</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-400" /> Efectivo</span>
                <span className="ml-auto">Toca una barra para ver detalles</span>
              </div>
            </div>

            {/* Top products */}
            {topProducts.length > 0 && (
              <div className="rounded-xl bg-white border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">🏆 Top 10 productos</h3>
                <div className="space-y-2">
                  {topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-gray-50 text-gray-400"}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">{p.qty} uds</p>
                        <p className="text-xs text-gray-400">{p.revenue.toFixed(2)} €</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredOrders.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">📊</p>
                <p className="text-gray-500">No hay ventas en este periodo</p>
              </div>
            )}
          </>
        )}
      </div>
    </AuthenticatedLayout>
  )
}

function SummaryCard({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] font-medium text-gray-500">{label}</span></div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}
