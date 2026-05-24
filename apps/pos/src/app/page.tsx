"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { collection, getDocs, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import {
  ShoppingBag, CreditCard, TrendingUp, Coffee, Users,
  ArrowRight, Banknote, Smartphone, Clock,
} from "lucide-react"

type DashboardStats = {
  todayOrders: number
  todayRevenue: number
  todayCardRevenue: number
  todayCashRevenue: number
  todayAppOrders: number
  todayPosOrders: number
  todayTeacherOrders: number
  pendingOrders: number
  readyOrders: number
  topProducts: { name: string; qty: number; revenue: number }[]
}

function getStartOfDay(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getTimestamp(o: any): number {
  return o.createdAt?.toMillis?.() || o.createdAt?.seconds * 1000 || o.date?.toMillis?.() || o.date?.seconds * 1000 || 0
}

export default function DashboardPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <DashboardContent />
    </RoleGuard>
  )
}

function DashboardContent() {
  const { user } = useAuth();
  const { orgId } = useOrg(user);
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      if (!orgId) return;
      try {
        const startOfDay = getStartOfDay()

        // Read collections dynamically from the matched org
        const [ordersSnap, teacherSnap, ticketsSnap] = await Promise.all([
          getDocs(collection(db, "orgs", orgId, "orders")),
          getDocs(collection(db, "orgs", orgId, "teacher_orders")),
          getDocs(collection(db, "orgs", orgId, "tickets")),
        ])

        const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
        const allTeacher = teacherSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
        const allTickets = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]

        // Filtrar por hoy
        const todayOrders = allOrders.filter((o) => getTimestamp(o) >= startOfDay.getTime())
        const todayTeacher = allTeacher.filter((o) => getTimestamp(o) >= startOfDay.getTime())
        const todayTickets = allTickets.filter((o) => getTimestamp(o) >= startOfDay.getTime())

        // Ingresos de orders (APP)
        const todayAppRevenue = todayOrders.reduce((s: number, o: any) => {
          const t = o.total || o.items?.reduce((sum: number, i: any) => sum + (i.unitPrice || 0) * (i.qty || 0), 0) || 0
          return s + t
        }, 0)

        // Ingresos de tickets (POS)
        const todayTicketsCash = todayTickets.filter((o: any) => (o.paymentMethod || "CASH") === "CASH").reduce((s: number, o: any) => s + (o.total || 0), 0)
        const todayTicketsCard = todayTickets.filter((o: any) => o.paymentMethod === "CARD").reduce((s: number, o: any) => s + (o.total || 0), 0)
        const todayTicketsRevenue = todayTicketsCash + todayTicketsCard

        // Revenue total = APP + POS
        const todayRevenue = todayAppRevenue + todayTicketsRevenue

        const todayCardRevenue = todayOrders
          .filter((o: any) => o.paymentMethod === "CARD" || (o.paymentStatus === "PAID" && o.paymentMethod !== "CASH"))
          .reduce((s: number, o: any) => s + (o.total || 0), 0) + todayTicketsCard

        const todayCashFromOrders = todayOrders
          .filter((o: any) => o.paymentMethod === "CASH")
          .reduce((s: number, o: any) => s + (o.total || 0), 0)
        const todayCashRevenue = todayCashFromOrders + todayTicketsCash

        const todayAppOrders = todayOrders.filter((o: any) => o.source === "APP").length
        const todayPosOrders = todayTickets.length


        const pendingOrders = allOrders.filter(
          (o: any) => o.status === "CREATED" || o.status === "IN_QUEUE" || o.status === "PREPARING"
        ).length
        const readyOrders = allOrders.filter((o: any) => o.status === "READY").length

        // Top productos: combinar orders + tickets
        const productMap = new Map<string, { name: string; qty: number; revenue: number }>()

        todayOrders.forEach((o: any) => {
          o.items?.forEach((item: any) => {
            const key = item.productName || item.name || item.productId || "Producto"
            const existing = productMap.get(key) || { name: key, qty: 0, revenue: 0 }
            existing.qty += item.qty || 1
            existing.revenue += (item.unitPrice || 0) * (item.qty || 1)
            productMap.set(key, existing)
          })
        })

        todayTickets.forEach((o: any) => {
          o.items?.forEach((item: any) => {
            const key = item.product?.name || item.name || item.productName || "Producto"
            const existing = productMap.get(key) || { name: key, qty: 0, revenue: 0 }
            existing.qty += item.quantity || item.qty || 1
            existing.revenue += (item.product?.price || item.price || item.unitPrice || 0) * (item.quantity || item.qty || 1)
            productMap.set(key, existing)
          })
        })

        const topProducts = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5)

        setStats({
          todayOrders: todayOrders.length + todayTeacher.length + todayTickets.length,
          todayRevenue, todayCardRevenue, todayCashRevenue,
          todayAppOrders, todayPosOrders,
          todayTeacherOrders: todayTeacher.length,
          pendingOrders, readyOrders, topProducts,
        })
      } catch (err) {
        console.error("Error loading dashboard:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [orgId])

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <Link href="/pos" className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">
            <Coffee className="h-4 w-4" />Ir al POS<ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          </div>
        ) : stats ? (
          <>
            {(stats.pendingOrders > 0 || stats.readyOrders > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {stats.pendingOrders > 0 && (
                  <Link href="/pos" className="flex items-center gap-3 rounded-xl bg-amber-50 border-2 border-amber-300 p-4 hover:bg-amber-100 transition-colors">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200"><Clock className="h-5 w-5 text-amber-700" /></div>
                    <div><p className="text-2xl font-bold text-amber-800">{stats.pendingOrders}</p><p className="text-xs text-amber-600 font-medium">Pendientes</p></div>
                  </Link>
                )}
                {stats.readyOrders > 0 && (
                  <div className="flex items-center gap-3 rounded-xl bg-green-50 border-2 border-green-300 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200 animate-pulse"><ShoppingBag className="h-5 w-5 text-green-700" /></div>
                    <div><p className="text-2xl font-bold text-green-800">{stats.readyOrders}</p><p className="text-xs text-green-600 font-medium">Listos</p></div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<TrendingUp className="h-5 w-5 text-green-600" />} label="Ingresos hoy" value={`${stats.todayRevenue.toFixed(2)} €`} bg="bg-green-50 border-green-200" />
              <StatCard icon={<ShoppingBag className="h-5 w-5 text-blue-600" />} label="Pedidos hoy" value={stats.todayOrders.toString()} bg="bg-blue-50 border-blue-200" />
              <StatCard icon={<CreditCard className="h-5 w-5 text-violet-600" />} label="Tarjeta" value={`${stats.todayCardRevenue.toFixed(2)} €`} bg="bg-violet-50 border-violet-200" />
              <StatCard icon={<Banknote className="h-5 w-5 text-amber-600" />} label="Efectivo" value={`${stats.todayCashRevenue.toFixed(2)} €`} bg="bg-amber-50 border-amber-200" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-gray-200 p-4 text-center">
                <Smartphone className="h-5 w-5 text-blue-500 mx-auto mb-1" /><p className="text-xl font-bold text-gray-900">{stats.todayAppOrders}</p><p className="text-xs text-gray-500">Pedidos App</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 p-4 text-center">
                <Coffee className="h-5 w-5 text-amber-500 mx-auto mb-1" /><p className="text-xl font-bold text-gray-900">{stats.todayPosOrders}</p><p className="text-xs text-gray-500">Pedidos POS</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 p-4 text-center">
                <Users className="h-5 w-5 text-green-500 mx-auto mb-1" /><p className="text-xl font-bold text-gray-900">{stats.todayTeacherOrders}</p><p className="text-xs text-gray-500">Profesores</p>
              </div>
            </div>

            {stats.topProducts.length > 0 && (
              <div className="rounded-xl bg-white border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">🏆 Productos más vendidos hoy</h3>
                <div className="space-y-2">
                  {stats.topProducts.map((product, i) => (
                    <div key={product.name} className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-gray-50 text-gray-400"}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{product.name}</p></div>
                      <div className="text-right shrink-0"><p className="text-sm font-bold text-gray-900">{product.qty} uds</p><p className="text-xs text-gray-400">{product.revenue.toFixed(2)} €</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/pos", label: "Punto de Venta", icon: Coffee, color: "text-green-600" },
                { href: "/teacher-order", label: "Pedido Profesores", icon: Users, color: "text-blue-600" },
                { href: "/receipts", label: "Recibos", icon: CreditCard, color: "text-violet-600" },
                { href: "/reports", label: "Historial Ventas", icon: TrendingUp, color: "text-emerald-600" },
                { href: "/products", label: "Productos", icon: ShoppingBag, color: "text-amber-600" },
                { href: "/categories", label: "Categorías", icon: Coffee, color: "text-orange-600" },
                { href: "/magic-inventory", label: "Inventario IA", icon: ShoppingBag, color: "text-teal-600" },
                { href: "/users", label: "Usuarios", icon: Users, color: "text-pink-600" },
              ].map(({ href, label, icon: Icon, color }) => (
                <Link key={href} href={href} className="flex items-center gap-3 rounded-xl bg-white border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
                  <Icon className={`h-5 w-5 ${color}`} /><span className="text-sm font-medium text-gray-700">{label}</span><ArrowRight className="h-4 w-4 text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="text-center text-gray-500 py-10">Error cargando datos</p>
        )}
      </div>
    </AuthenticatedLayout>
  )
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-gray-500">{label}</span></div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
