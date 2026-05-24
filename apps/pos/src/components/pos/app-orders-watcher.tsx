"use client"

/**
 * AppOrdersWatcher — listener permanente de pedidos APP/TEACHER_APP en estado
 * activo. Hace dos cosas para reducir tiempos de reacción del barista:
 *
 *   1. Notifica al padre el conteo de pedidos activos (para badge en el
 *      botón Smartphone del header).
 *   2. Cuando llega un pedido NUEVO (id no visto antes), dispara toast con
 *      resumen de items y reproduce un sonido de notificación.
 *
 * Se monta una vez en `pos/page.tsx` y vive en background. El primer
 * snapshot NO dispara toast (los pedidos ya existían antes de abrir el POS).
 *
 * Reusa `listenAppOrders` que ya filtra por `status in ACTIVE_STATUSES`.
 * Comparte listener con `AppOrdersPanel` cuando está abierto, pero como
 * Firestore deduplica suscripciones internamente, el coste es bajo.
 */

import { useEffect, useRef } from "react"
import { listenAppOrders } from "@/lib/app-orders-service"
import { toast } from "@/components/ui/use-toast"
import type { AppOrder } from "@/lib/app-orders-types"

interface AppOrdersWatcherProps {
  /** Llamado en cada snapshot con el total de pedidos activos. */
  onCountChange?: (count: number) => void
  /**
   * True para disparar toast + sonido al detectar pedido nuevo. Default true.
   * (Útil pasarlo a false en pruebas o cuando otra UI ya hace ruido.)
   */
  notify?: boolean
}

const PREVIEW_MAX_ITEMS = 3
const TOAST_DURATION_MS = 8000

export function AppOrdersWatcher({
  onCountChange,
  notify = true,
}: AppOrdersWatcherProps) {
  const knownIdsRef = useRef<Set<string>>(new Set())
  // El primer snapshot trae los pedidos ya existentes — no son "nuevos"
  // desde el punto de vista del barista (ya estaban antes de abrir POS).
  const isFirstSnapshotRef = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Cargar audio una sola vez. Si el navegador bloquea autoplay (común sin
  // interacción previa), el .play() lanza pero lo absorbemos.
  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3")
    audioRef.current.preload = "auto"
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const unsub = listenAppOrders((orders) => {
      onCountChange?.(orders.length)

      const currentIds = new Set(orders.map((o) => o.id))

      if (isFirstSnapshotRef.current) {
        knownIdsRef.current = currentIds
        isFirstSnapshotRef.current = false
        return
      }

      // Pedidos nuevos = en current pero no en known.
      const newOnes = orders.filter((o) => !knownIdsRef.current.has(o.id))
      knownIdsRef.current = currentIds

      if (newOnes.length === 0 || !notify) return

      // Sonido — best effort, ignoramos rechazo de autoplay.
      try {
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => undefined)
        }
      } catch {
        /* ignore */
      }

      // Toast por cada nuevo pedido (suelen ser 1; raro > 1 en un snapshot).
      for (const order of newOnes) {
        toast({
          title: titleFor(order),
          description: itemsPreview(order),
          duration: TOAST_DURATION_MS,
        })
      }
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify])

  return null
}

function titleFor(order: AppOrder): string {
  const tag = order.source === "TEACHER_APP" ? "👩‍🏫" : "📱"
  return `${tag} Nuevo pedido · ${order.customerName || "Cliente"}`
}

/** Resumen "2× Café con leche, 1× Galleta (+1 más)". */
function itemsPreview(order: AppOrder): string {
  if (!order.items || order.items.length === 0) return "Pedido sin items"
  const head = order.items
    .slice(0, PREVIEW_MAX_ITEMS)
    .map((i) => `${i.qty}× ${i.productName}`)
    .join(", ")
  const rest = order.items.length - PREVIEW_MAX_ITEMS
  const tail = rest > 0 ? ` (+${rest} más)` : ""
  // Si hay nota del bono ("🎟️ Bono Exámenes…"), la añadimos para que el
  // barista vea de un vistazo que es un canje.
  const isBono = (order.notes ?? "").includes("Bono Exámenes")
  const prefix = isBono ? "🎟️ " : ""
  return `${prefix}${head}${tail}`
}
