"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import {
  LayoutDashboard, Coffee, ShoppingBag, Users, ClipboardList, LineChart,
  BarChart3, Package, Tag, LogOut, Menu, X, ChevronRight,
} from "lucide-react"

const ADMIN_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "text-green-600" },
  { href: "/pos", label: "Punto de Venta", icon: Coffee, color: "text-amber-600" },
  { href: "/products", label: "Productos", icon: ShoppingBag, color: "text-blue-600" },
  { href: "/categories", label: "Categorías", icon: Tag, color: "text-orange-600" },
  { href: "/inventory", label: "Inventario", icon: Package, color: "text-teal-600" },
  { href: "/teacher-order", label: "Profesores", icon: Users, color: "text-violet-600" },
  { href: "/receipts", label: "Recibos", icon: ClipboardList, color: "text-slate-600" },
  { href: "/reports", label: "Reportes", icon: BarChart3, color: "text-emerald-600" },
  { href: "/insights", label: "Insights", icon: LineChart, color: "text-cyan-600" },
  { href: "/users", label: "Usuarios", icon: Users, color: "text-pink-600" },
]

const VENDOR_NAV = [
  { href: "/pos", label: "Punto de Venta", icon: Coffee, color: "text-amber-600" },
  { href: "/teacher-order", label: "Profesores", icon: Users, color: "text-violet-600" },
]

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, signOut: logout } = useSimpleAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login")
  }, [user, isLoading, router])

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 shadow-lg"><span className="text-2xl">☕</span></div>
        <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    </div>
  )

  if (!user) return null

  const navItems = user.role === "admin" ? ADMIN_NAV : VENDOR_NAV

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-out md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 shadow-sm">
                <span className="text-xl">☕</span>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Raíz y Grano</p>
                <p className="text-[10px] text-gray-400 font-medium">PUNTO DE VENTA</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {navItems.map(({ href, label, icon: Icon, color }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? "bg-green-50 text-green-700 shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                  <Icon className={`h-[18px] w-[18px] ${isActive ? "text-green-600" : color}`} />
                  {label}
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto text-green-400" />}
                </Link>
              )
            })}
          </nav>

          {/* User info */}
          <div className="border-t border-gray-100 p-3">
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${user.role === "admin" ? "bg-amber-500" : "bg-blue-500"}`}>
                {user.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-[11px] text-gray-400">{user.role === "admin" ? "👑 Admin" : "🧑‍💼 Vendedor"}</p>
              </div>
              <button onClick={logout} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600"><span className="text-sm">☕</span></div>
            <span className="text-sm font-bold text-gray-900">Raíz y Grano</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
