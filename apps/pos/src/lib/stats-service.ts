import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore"
import { db } from "./firebase"
import type { Ticket } from "./ticket-service"

// Tipos
export type DailySales = {
  date: string
  sales: number
  orders: number
}

export type ProductSales = {
  productId: string
  productName: string
  quantity: number
  total: number
}

// Colección
const TICKETS_COLLECTION = "tickets"

// Obtener ventas por día
export const getDailySales = async (days = 7): Promise<DailySales[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Calcular fecha de inicio (hace 'days' días)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Obtener tickets desde esa fecha
    const ticketsRef = collection(db, TICKETS_COLLECTION)
    const q = query(ticketsRef, where("date", ">=", Timestamp.fromDate(startDate)), orderBy("date", "desc"))
    const querySnapshot = await getDocs(q)

    const tickets = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Ticket,
    )

    // Agrupar por día
    const salesByDay = new Map<string, { sales: number; orders: number }>()

    // Inicializar todos los días con ceros
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const dateStr = date.toISOString().split("T")[0]
      salesByDay.set(dateStr, { sales: 0, orders: 0 })
    }

    // Sumar ventas por día
    tickets.forEach((ticket) => {
      const date = new Date((ticket.date as any).toDate())
      const dateStr = date.toISOString().split("T")[0]

      const current = salesByDay.get(dateStr) || { sales: 0, orders: 0 }
      salesByDay.set(dateStr, {
        sales: current.sales + ticket.total,
        orders: current.orders + 1,
      })
    })

    // Convertir a array y ordenar por fecha
    return Array.from(salesByDay.entries())
      .map(([date, data]) => ({
        date,
        sales: data.sales,
        orders: data.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (error: any) {
    console.error("Error al obtener ventas diarias:", error)
    return []
  }
}

// Obtener productos más vendidos
export const getTopProducts = async (count = 5, startDate?: Date, endDate?: Date): Promise<ProductSales[]> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Construir query
    const ticketsRef = collection(db, TICKETS_COLLECTION)
    let q

    if (startDate && endDate) {
      q = query(
        ticketsRef,
        where("date", ">=", Timestamp.fromDate(startDate)),
        where("date", "<=", Timestamp.fromDate(endDate)),
        orderBy("date", "desc"),
      )
    } else {
      q = query(ticketsRef, orderBy("date", "desc"))
    }

    const querySnapshot = await getDocs(q)

    const tickets = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Ticket,
    )

    // Agrupar por producto
    const productSales = new Map<string, ProductSales>()

    tickets.forEach((ticket) => {
      ticket.items.forEach((item) => {
        const productId = item.product.id
        const current = productSales.get(productId) || {
          productId,
          productName: item.product.name,
          quantity: 0,
          total: 0,
        }

        productSales.set(productId, {
          ...current,
          quantity: current.quantity + item.quantity,
          total: current.total + item.product.price * item.quantity,
        })
      })
    })

    // Convertir a array, ordenar por cantidad y limitar
    return Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, count)
  } catch (error: any) {
    console.error("Error al obtener productos más vendidos:", error)
    return []
  }
}

// Obtener total de ventas y órdenes
export const getSalesSummary = async (
  startDate?: Date,
  endDate?: Date,
): Promise<{ totalSales: number; totalOrders: number; averageTicket: number }> => {
  if (!db) throw new Error("Firestore no está inicializado")

  try {
    // Construir query
    const ticketsRef = collection(db, TICKETS_COLLECTION)
    let q

    if (startDate && endDate) {
      q = query(
        ticketsRef,
        where("date", ">=", Timestamp.fromDate(startDate)),
        where("date", "<=", Timestamp.fromDate(endDate)),
      )
    } else {
      q = query(ticketsRef)
    }

    const querySnapshot = await getDocs(q)

    const tickets = querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Ticket,
    )

    const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0)
    const totalOrders = tickets.length
    const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0

    return { totalSales, totalOrders, averageTicket }
  } catch (error: any) {
    console.error("Error al obtener resumen de ventas:", error)
    return { totalSales: 0, totalOrders: 0, averageTicket: 0 }
  }
}
