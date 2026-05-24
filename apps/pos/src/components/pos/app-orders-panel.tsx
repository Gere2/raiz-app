"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { toast } from "sonner"
import { listenAppOrders, advanceAppOrderStatus } from "@/lib/app-orders-service"
import {
  APP_STATUS_FLOW,
  APP_STATUS_CONFIG,
  type AppOrder,
  type AppOrderStatus,
} from "@/lib/app-orders-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChevronRight,
  Package,
  AlertCircle,
  Coffee,
  Clock,
  Zap,
  X,
} from "lucide-react"

/* ── Sonido de notificación ─────────────────── */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const tone = (freq: number, start: number, dur = 0.15) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    tone(830, 0, 0.15)
    tone(1050, 0.18, 0.25)
  } catch {
    /* audio not available */
  }
}

/* ── Filtros ─────────────────────────────────── */
type FilterType = "active" | "ready" | "all"

/* ── Componente principal ────────────────────── */
export default function AppOrdersPanel() {
  const [orders, setOrders] = useState<AppOrder[]>([])
  const [filter, setFilter] = useState<FilterType>("active")
  const [error, setError] = useState<string | null>(null)
  const prevIdsRef = useRef<Set<string>>(new Set())
  const isFirstRef = useRef(true)

  useEffect(() => {
    const unsub = listenAppOrders(
      (list) => {
        if (!isFirstRef.current) {
          list.forEach((order) => {
            if (
              !prevIdsRef.current.has(order.id) &&
              order.status === "CREATED"
            ) {
              playNotificationSound()
              const pickup =
                order.pickupType === "SCHEDULED" && order.pickupTimeLabel
                  ? `Recogida: ${order.pickupTimeLabel}`
                  : "Lo antes posible"
              toast.success(
                `🛎️ Nuevo pedido de ${order.customerName || "Cliente"}`,
                { description: pickup, duration: 8000 }
              )
            }
          })
        }
        isFirstRef.current = false
        prevIdsRef.current = new Set(list.map((o) => o.id))
        setOrders(list)
        setError(null)
      },
      () => setError("Error al conectar con los pedidos. Verifica tu conexión.")
    )
    return () => unsub()
  }, [])

  /* Avanzar estado */
  const advance = useCallback(
    async (orderId: string, currentStatus: AppOrderStatus) => {
      const idx = APP_STATUS_FLOW.indexOf(currentStatus)
      if (idx < 0 || idx >= APP_STATUS_FLOW.length - 1) return
      const next = APP_STATUS_FLOW[idx + 1]
      try {
        await advanceAppOrderStatus(orderId, next)
        toast.success(`Pedido → ${APP_STATUS_CONFIG[next].label}`)
      } catch {
        toast.error("Error al actualizar el pedido")
      }
    },
    []
  )

  const cancelOrder = useCallback(
    async (orderId: string) => {
      try {
        await advanceAppOrderStatus(orderId, "CANCELED")
        toast.success("Pedido cancelado")
      } catch {
        toast.error("Error al cancelar")
      }
    },
    []
  )

  /* Filtrar */
  const filtered = orders.filter((o) => {
    if (filter === "active")
      return o.status !== "PICKED_UP" && o.status !== "CANCELED"
    if (filter === "ready") return o.status === "READY"
    return true
  })

  const activeCount = orders.filter(
    (o) => o.status !== "PICKED_UP" && o.status !== "CANCELED"
  ).length
  const readyCount = orders.filter((o) => o.status === "READY").length
  const preparingCount = orders.filter((o) => o.status === "PREPARING").length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold">Pedidos App</h2>
          </div>
          {activeCount > 0 && (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white animate-pulse">
              {activeCount}
            </span>
          )}
        </div>

        {/* Contadores */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 rounded-lg bg-amber-50 p-2 text-center border border-amber-200">
            <p className="text-xs text-amber-600 font-medium">Preparando</p>
            <p className="text-xl font-bold text-amber-800">{preparingCount}</p>
          </div>
          <div className="flex-1 rounded-lg bg-emerald-50 p-2 text-center border border-emerald-200">
            <p className="text-xs text-emerald-600 font-medium">Listos</p>
            <p className="text-xl font-bold text-emerald-800">{readyCount}</p>
          </div>
          <div className="flex-1 rounded-lg bg-blue-50 p-2 text-center border border-blue-200">
            <p className="text-xs text-blue-600 font-medium">Total</p>
            <p className="text-xl font-bold text-blue-800">{activeCount}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-1">
          {(["active", "ready", "all"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? f === "ready"
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {f === "active"
                ? `Activos (${activeCount})`
                : f === "ready"
                  ? `Listos (${readyCount})`
                  : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Lista */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Sin pedidos</p>
              <p className="text-sm">
                {filter === "ready"
                  ? "No hay pedidos listos"
                  : filter === "active"
                    ? "No hay pedidos activos"
                    : "No hay pedidos registrados"}
              </p>
            </div>
          ) : (
            filtered.map((order) => (
              <AppOrderCard key={order.id} order={order} onAdvance={advance} onCancel={cancelOrder} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/* ── Tarjeta de pedido ───────────────────────── */
function AppOrderCard({
  order,
  onAdvance,
  onCancel,
}: {
  order: AppOrder
  onAdvance: (id: string, status: AppOrderStatus) => void
  onCancel: (id: string) => void
}) {
  const cfg = APP_STATUS_CONFIG[order.status] ?? APP_STATUS_CONFIG.CREATED
  const idx = APP_STATUS_FLOW.indexOf(order.status)
  const nextStatus =
    idx >= 0 && idx < APP_STATUS_FLOW.length - 1
      ? APP_STATUS_FLOW[idx + 1]
      : null

  const isNew = order.status === "CREATED"
  const isReady = order.status === "READY"
  const isASAP = order.pickupType === "ASAP"

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${cfg.bg} ${
        isReady ? "ring-2 ring-emerald-400 ring-offset-2" : ""
      } ${isNew ? "animate-in fade-in slide-in-from-top-2 duration-500" : ""}`}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-gray-400">
              #{order.id.slice(-6).toUpperCase()}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.color} ${cfg.bg}`}
            >
              {cfg.label}
            </span>
            {isNew && (
              <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 animate-pulse">
                NUEVO
              </span>
            )}
          </div>
          <p className={`mt-1 text-sm font-medium ${cfg.textColor}`}>
            {order.source === "TEACHER_APP" && (
              <span className="inline-flex items-center rounded-md bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 mr-1.5 uppercase">
                Profesor
              </span>
            )}
            {order.customerName || "Cliente"}
          </p>
        </div>

        {/* Badge hora recogida */}
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 shadow-sm ${
            isASAP
              ? "bg-orange-100 border border-orange-300"
              : "bg-blue-100 border border-blue-300"
          }`}
        >
          {isASAP ? (
            <>
              <Zap className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-bold text-orange-700">ASAP</span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-700">
                {order.pickupTimeLabel || "Programado"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="mt-3 space-y-0.5">
        {order.items?.map((it, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className={cfg.textColor}>
              <span className="font-medium">{it.qty}x</span> {it.productName}
            </span>
            <span className="text-gray-500 tabular-nums">
              {(it.unitPrice * it.qty).toFixed(2)} €
            </span>
          </div>
        ))}
      </div>

      {/* Delivery info for teacher orders */}
      {order.source === "TEACHER_APP" && order.delivery && (
        <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-2 text-xs text-indigo-700 space-y-0.5">
          <p className="font-semibold">Entrega: {order.delivery.locationDetail}</p>
          <p>Fecha: {order.delivery.deliveryDate} · {order.delivery.deliveryTime}</p>
          <p>Para: {order.delivery.recipientName}{order.delivery.department ? ` · ${order.delivery.department}` : ""}</p>
          {order.delivery.attendees ? <p>Asistentes: {order.delivery.attendees}</p> : null}
          {order.delivery.contactPhone ? <p>Tel: {order.delivery.contactPhone}</p> : null}
          {order.skipPayment && <p className="text-amber-600 font-semibold">Sin pago (prueba)</p>}
        </div>
      )}

      {/* Notas */}
      {order.notes && (
        <p className="mt-2 rounded-lg bg-white/60 border border-black/5 px-2.5 py-1.5 text-xs text-gray-600 italic">
          💬 {order.notes}
        </p>
      )}

      {/* Total + Botón */}
      <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
        <span className={`text-lg font-bold ${cfg.textColor}`}>
          {((order.total ?? order.items?.reduce((s: number, i: any) => s + (i.unitPrice || 0) * (i.qty || 0), 0) ?? 0).toFixed(2))} €
        </span>
        <div className="flex gap-2">
          {order.status !== "PICKED_UP" && order.status !== "CANCELED" && (
            <Button
              onClick={() => onCancel(order.id)}
              size="sm"
              variant="outline"
              className="gap-1 text-red-600 border-red-200 hover:bg-red-50 active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {nextStatus ? (
            <Button
              onClick={() => onAdvance(order.id, order.status)}
              size="sm"
              className={`gap-1.5 font-medium transition-all active:scale-95 ${
                nextStatus === "READY"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : nextStatus === "PICKED_UP"
                    ? "bg-gray-600 hover:bg-gray-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {APP_STATUS_CONFIG[nextStatus].label}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : order.status !== "PICKED_UP" && order.status !== "CANCELED" ? (
            <Button
              onClick={() => onCancel(order.id)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white gap-1 active:scale-95"
            >
              Cancelar
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Barra progreso */}
      <div className="mt-3 flex gap-1">
        {APP_STATUS_FLOW.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= idx
                ? i === idx
                  ? "bg-current opacity-60"
                  : "bg-current opacity-30"
                : "bg-black/10"
            }`}
            style={{
              color:
                order.status === "READY"
                  ? "#059669"
                  : order.status === "PREPARING"
                    ? "#d97706"
                    : "#2563eb",
            }}
          />
        ))}
      </div>
    </div>
  )
}
