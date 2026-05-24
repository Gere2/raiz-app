import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from "firebase/firestore"
import { db } from "./firebase"

// Tipos
export type OrderStatus = "pending" | "preparing" | "ready" | "delivered" | "cancelled"
export type DeliveryType = "classroom" | "pickup"

export type Order = {
  id: string
  teacherName: string
  teacherId?: string
  items: {
    productId: string
    productName: string
    quantity: number
    price: number
  }[]
  total: number
  status: OrderStatus
  deliveryType: DeliveryType
  classroom?: string
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Colección
const ORDERS_COLLECTION = "teacher_orders"

// Obtener todos los pedidos
export const getOrders = async (status?: OrderStatus): Promise<Order[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const ordersRef = collection(db, ORDERS_COLLECTION)
    let q = query(ordersRef, orderBy("createdAt", "desc"))

    if (status) {
      q = query(ordersRef, where("status", "==", status), orderBy("createdAt", "desc"))
    }

    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Order,
    )
  } catch (error: any) {
    console.error("Error al obtener pedidos:", error)
    return []
  }
}

// Crear un nuevo pedido
export const createOrder = async (order: Omit<Order, "id" | "createdAt" | "updatedAt" | "status">): Promise<Order> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const orderData = {
      ...order,
      status: "pending" as OrderStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, ORDERS_COLLECTION), orderData)

    return {
      id: docRef.id,
      ...orderData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as Order
  } catch (error: any) {
    console.error("Error al crear pedido:", error)
    throw new Error(`Error al crear pedido: ${error.message}`)
  }
}

// Actualizar estado de un pedido
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId)
    await updateDoc(orderRef, {
      status,
      updatedAt: serverTimestamp(),
    })
  } catch (error: any) {
    console.error("Error al actualizar estado del pedido:", error)
    throw new Error(`Error al actualizar estado del pedido: ${error.message}`)
  }
}

// Escuchar nuevos pedidos en tiempo real
export const listenForNewOrders = (callback: (orders: Order[]) => void): (() => void) => {
  if (!db) {
    console.error("Firestore no está inicializado")
    return () => {}
  }

  try {
    const ordersRef = collection(db, ORDERS_COLLECTION)
    const q = query(ordersRef, where("status", "==", "pending"), orderBy("createdAt", "desc"))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as Order,
        )
        callback(orders)
      },
      (error) => {
        // Verificar si el error es por falta de índice
        if (error.code === "failed-precondition" && error.message.includes("index")) {
          // Extraer la URL del índice del mensaje de error
          const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)
          const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null

          console.error("Error al escuchar nuevos pedidos: Se requiere un índice en Firestore", indexUrl)
          // Devolver una lista vacía para no romper la aplicación
          callback([])

          // Mostrar alerta al usuario (esto se manejará en el componente)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("firestore-index-required", {
                detail: { url: indexUrl, collection: "teacher_orders" },
              }),
            )
          }
        } else {
          console.error("Error al escuchar nuevos pedidos:", error)
          callback([])
        }
      },
    )

    return unsubscribe
  } catch (error) {
    console.error("Error al configurar listener para pedidos:", error)
    return () => {}
  }
}

// Obtener pedidos pendientes
export const getPendingOrders = async (): Promise<Order[]> => {
  return getOrders("pending")
}
