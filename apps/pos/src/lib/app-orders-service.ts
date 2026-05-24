import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "./firebase"
import type { AppOrder, AppOrderStatus } from "./app-orders-types"

import { limit } from "firebase/firestore"

/**
 * Estados de pedido que el barista debe ver en el panel del POS.
 * Excluye terminales (PICKED_UP, CANCELED) que ensucian la lista y
 * además pueden ser cientos de docs históricos.
 */
const ACTIVE_STATUSES: AppOrderStatus[] = [
  "CREATED",
  "IN_QUEUE",
  "PREPARING",
  "READY",
]

/** Cap defensivo: si por algún motivo hay > 50 órdenes activas, no traemos todas. */
const MAX_LIVE_ORDERS = 50

/**
 * Escucha en tiempo real los pedidos de APP y TEACHER_APP en estados ACTIVOS
 * (collection "orders"). Filtramos en server-side para que el panel del POS
 * solo reciba lo que necesita pintar — no el histórico.
 *
 * Antes traíamos TODOS los `source: "APP"` sin filtro: con muchas órdenes
 * antiguas, el listener entregaba cientos de docs cada update. Ahora solo
 * vemos los pedidos vivos.
 */
export function listenAppOrders(
  callback: (orders: AppOrder[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!db) {
    console.error("Firestore no está inicializado")
    return () => {}
  }

  let appOrders: AppOrder[] = []
  let teacherOrders: AppOrder[] = []

  const mergeAndNotify = () => {
    const all = [...appOrders, ...teacherOrders]
    // Ordenar en el cliente: más recientes primero
    all.sort((a, b) => {
      const ta = (a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000) ?? 0
      const tb = (b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000) ?? 0
      return tb - ta
    })
    callback(all)
  }

  // Listener 1: APP orders activos
  const qApp = query(
    collection(db, "orders"),
    where("source", "==", "APP"),
    where("status", "in", ACTIVE_STATUSES),
    limit(MAX_LIVE_ORDERS)
  )

  const unsubApp = onSnapshot(
    qApp,
    (snap) => {
      appOrders = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AppOrder
      )
      mergeAndNotify()
    },
    (error) => {
      console.error("Error escuchando pedidos APP:", error)
      onError?.(error as Error)
    }
  )

  // Listener 2: TEACHER_APP orders activos
  const qTeacher = query(
    collection(db, "orders"),
    where("source", "==", "TEACHER_APP"),
    where("status", "in", ACTIVE_STATUSES),
    limit(MAX_LIVE_ORDERS)
  )

  const unsubTeacher = onSnapshot(
    qTeacher,
    (snap) => {
      teacherOrders = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AppOrder
      )
      mergeAndNotify()
    },
    (error) => {
      console.error("Error escuchando pedidos TEACHER_APP:", error)
      onError?.(error as Error)
    }
  )

  return () => {
    unsubApp()
    unsubTeacher()
  }
}

/**
 * Avanza el estado de un pedido APP al siguiente en el flujo.
 */
export async function advanceAppOrderStatus(
  orderId: string,
  newStatus: AppOrderStatus
): Promise<void> {
  if (!db) throw new Error("Firestore no está inicializado")

  const orderRef = doc(db, "orders", orderId)

  const updateData: Record<string, any> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  }

  // Calcular tiempo de preparación al completar
  if (newStatus === "READY" || newStatus === "PICKED_UP") {
    try {
      const snap = await getDoc(orderRef)
      if (snap.exists()) {
        const createdAt = snap.data().createdAt
        if (createdAt) {
          const startMs = createdAt.toDate ? createdAt.toDate().getTime() : createdAt.seconds * 1000
          const diffSecs = Math.max(0, Math.round((Date.now() - startMs) / 1000))
          updateData.preparationTimeSecs = diffSecs
          updateData.preparationTimeMin = Math.round(diffSecs / 6) / 10
          updateData.completedAt = serverTimestamp()
        }
      }
    } catch (err) {
      console.error("[PrepTime] Error:", err)
    }
  }

  await updateDoc(orderRef, updateData)
}
