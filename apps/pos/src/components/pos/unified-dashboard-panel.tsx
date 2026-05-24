"use client"

import { useState, useEffect } from "react"
import { subscribeToAllOrders, type UnifiedOrder } from "./unified-orders-service"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Smartphone, Monitor, Clock, CheckCircle, Loader2 } from "lucide-react"

type FilterSource = "ALL" | "POS" | "APP"
type FilterTime = "today" | "week" | "all"

export default function UnifiedDashboardPanel() {
  const [orders, setOrders] = useState<UnifiedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSource, setFilterSource] = useState<FilterSource>("ALL")
  const [filterTime, setFilterTime] = useState<FilterTime>("today")

  useEffect(() => {
    const unsub = subscribeToAllOrders({
      onData: (data) => {
        setOrders(data)
        setLoading(false)
      },
      onError: (err) => {
        console.error(err)
        setLoading(false)
      },
    })
    return unsub
  }, [])

  // ── Filtros ──
  const filtered = orders.filter((o) => {
    // Filtro por fuente
    if (filterSource !== "ALL" && o.source !== filterSource) return false

    // Filtro por tiempo
    if (filterTime === "today") {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return o.createdAt >= startOfDay
    }
    if (filterTime === "week") {
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return o.createdAt >= weekAgo
    }
    return true
  })

  // ── Resumen ──
  const totalRevenue = filtered.reduce((s, o) => s + o.total, 0)
  const posCount = filtered.filter((o) => o.source === "POS").length
  const appCount = filtered.filter((o) => o.source === "APP").length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Cargando tickets...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{filtered.length}</div>
            <div className="text-xs text-muted-foreground">Total tickets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{totalRevenue.toFixed(2)} €</div>
            <div className="text-xs text-muted-foreground">Ingresos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-sm font-medium">
              <span className="text-blue-600">{posCount} POS</span>
              {" / "}
              <span className="text-green-600">{appCount} APP</span>
            </div>
            <div className="text-xs text-muted-foreground">Por fuente</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {/* Fuente */}
        {(["ALL", "POS", "APP"] as FilterSource[]).map((src) => (
          <button
            key={src}
            onClick={() => setFilterSource(src)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterSource === src
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {src === "ALL" ? "Todos" : src}
          </button>
        ))}

        <div className="w-px bg-border mx-1" />

        {/* Tiempo */}
        {([
          { key: "today", label: "Hoy" },
          { key: "week", label: "Semana" },
          { key: "all", label: "Histórico" },
        ] as { key: FilterTime; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTime(key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterTime === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <ScrollArea className="h-[60vh]">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay tickets con estos filtros
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => (
              <Card key={`${order.source}-${order.id}`} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {order.source === "POS" ? (
                        <Monitor className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Smartphone className="h-4 w-4 text-green-500" />
                      )}
                      <span className="font-medium text-sm">
                        {order.source === "POS"
                          ? `Ticket #${order.ticketNumber ?? "—"}`
                          : order.customerName || "Pedido App"}
                      </span>
                      <Badge
                        variant={order.source === "POS" ? "secondary" : "default"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {order.source}
                      </Badge>
                    </div>
                    <span className="font-bold text-sm">{order.total.toFixed(2)} €</span>
                  </div>

                  {/* Items preview */}
                  <div className="text-xs text-muted-foreground truncate">
                    {order.items.map((i) => `${i.qty}x ${i.name}`).join(", ") || "Sin items"}
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {order.createdAt.toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {order.source === "APP" && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          order.status === "READY" || order.status === "PICKED_UP"
                            ? "border-green-500 text-green-600"
                            : order.status === "PREPARING"
                              ? "border-yellow-500 text-yellow-600"
                              : "border-blue-500 text-blue-600"
                        }`}
                      >
                        {order.status}
                      </Badge>
                    )}
                    {order.source === "POS" && order.userName && (
                      <span className="text-[10px] text-muted-foreground">
                        por {order.userName}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
