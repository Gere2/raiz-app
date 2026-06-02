import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDoc,
  limit,
  startAfter,
  QueryConstraint,
} from "firebase/firestore"
import { db } from "./firebase"
import { calculatePoints, awardPoints } from "./loyalty-points-service"
import type { Product } from "./product-service"
import { getNextTicketNumber, getFiscalData, type FiscalData } from "./fiscal-service"
import { enrichTransactionAsync, getCustomerType } from "./data-enrichment"
import { updateProductDailyStats } from "./product-stats-service"

// Tipos
export interface OrderItemModifier {
  id: string
  name: string
  priceAdjustment: number
}

export type OrderItem = {
  product: Product
  quantity: number
  modifiers?: OrderItemModifier[]
}

export type PaymentMethod = "CASH" | "CARD"
export type CustomerFrequency = "habitual" | "recurrente" | "extraño" | null
export type CustomerRole = "alumno" | "profesor" | null

export type Ticket = {
  id: string
  ticketNumber: number
  date: Timestamp | Date | any
  items: OrderItem[]
  total: number
  userId?: string
  userName?: string
  paymentMethod?: PaymentMethod
  createdAt?: Timestamp | Date | any
  fiscalData?: FiscalData
  [key: string]: any // enrichment fields
}

const getTicketsCollection = (orgId: string) => collection(db, "orgs", orgId, "tickets")

export const getTickets = async (orgId: string): Promise<Ticket[]> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const q = query(ticketsRef, orderBy("ticketNumber", "desc"))
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ticket)
  } catch (error: any) {
    console.error("Error al obtener tickets:", error)
    return []
  }
}

export const getTicketById = async (orgId: string, id: string): Promise<Ticket | null> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const docRef = doc(db, "orgs", orgId, "tickets", id)
    const docSnap = await getDoc(docRef)
    if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as Ticket
    return null
  } catch (error: any) {
    console.error("Error al obtener ticket:", error)
    return null
  }
}

// ══════════════════════════════════════
// Añadir ticket — ENRIQUECIDO + WEATHER + STATS
// ══════════════════════════════════════
export const addTicket = async (
  orgId: string,
  items: OrderItem[],
  userId?: string,
  userName?: string,
  paymentMethod: PaymentMethod = "CASH",
  customerFrequency?: CustomerFrequency,
  customerRole?: CustomerRole,
  selectedCustomerId?: string,
  selectedCustomerName?: string,
): Promise<Ticket> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")

  try {
    const total = items.reduce((sum, item) => {
      const modCost = (item.modifiers || []).reduce((s, m) => s + (m.priceAdjustment || 0), 0)
      return sum + (item.product.price + modCost) * item.quantity
    }, 0)
    const ticketNumber = await getNextTicketNumber() // Consider making this multi-tenant too
    const fiscalData = await getFiscalData()

    // ── Enriquecer datos (incluye weather + calendario) ──
    const enrichment = await enrichTransactionAsync(items, "POS")
    const customerType = getCustomerType("POS", customerRole === "profesor")

    const ticketData = {
      // Base
      ticketNumber,
      date: serverTimestamp(),
      items,
      total,
      userId,
      userName,
      paymentMethod,
      createdAt: serverTimestamp(),
      fiscalData,

      // Temporal
      dayOfWeek: enrichment.dayOfWeek,
      hourOfDay: enrichment.hourOfDay,
      minuteOfDay: enrichment.minuteOfDay,
      timeSlot: enrichment.timeSlot,
      weekNumber: enrichment.weekNumber,
      monthOfYear: enrichment.monthOfYear,
      isWeekend: enrichment.isWeekend,
      isHoliday: enrichment.isHoliday,
      schoolPeriod: enrichment.schoolPeriod,

      // Calendario universitario
      academicPeriod: enrichment.academicPeriod,
      academicWeek: enrichment.academicWeek,
      semester: enrichment.semester,
      isExamWeek: enrichment.isExamWeek,
      isFirstWeekOfClasses: enrichment.isFirstWeekOfClasses,
      isLastWeekOfClasses: enrichment.isLastWeekOfClasses,
      isPreHoliday: enrichment.isPreHoliday,
      isPostHoliday: enrichment.isPostHoliday,
      campusActivity: enrichment.campusActivity,
      season: enrichment.season,

      // Meteorología
      weatherTemp: enrichment.weatherTemp,
      weatherApparentTemp: enrichment.weatherApparentTemp,
      weatherHumidity: enrichment.weatherHumidity,
      weatherPrecipitation: enrichment.weatherPrecipitation,
      weatherWindSpeed: enrichment.weatherWindSpeed,
      weatherCondition: enrichment.weatherCondition,
      weatherBand: enrichment.weatherBand,
      isRainy: enrichment.isRainy,
      isCold: enrichment.isCold,
      isHot: enrichment.isHot,

      // Pedido
      itemCount: enrichment.itemCount,
      uniqueItems: enrichment.uniqueItems,
      uniqueCategories: enrichment.uniqueCategories,
      categoryNames: enrichment.categoryNames,
      avgItemPrice: enrichment.avgItemPrice,
      hasCombo: enrichment.hasCombo,
      itemPairs: enrichment.itemPairs,
      itemPairCount: enrichment.itemPairCount,
      hasMultipleItems: enrichment.hasMultipleItems,

      // Operativa
      customerType,
      source: "POS",
      queueSize: enrichment.queueSize,

      // Clasificación manual POS
      customerFrequency: customerFrequency || null,
      customerRole: customerRole || null,
      selectedCustomerId: selectedCustomerId || null,
      selectedCustomerName: selectedCustomerName || null,
    }

    // Firestore rechaza valores `undefined`. Los cafés que entran por el bridge
    // enverde (custom token) no tienen displayName/email → `userName` queda undefined
    // (y algún campo de enrichment podría faltar si una fuente externa falla).
    // Quitamos las claves undefined para que la venta no falle. Raíz no se ve
    // afectada: sus tickets siempre traen userName, así que no se omite nada.
    const ticketDataClean = Object.fromEntries(
      Object.entries(ticketData).filter(([, v]) => v !== undefined)
    )
    const docRef = await addDoc(getTicketsCollection(orgId), ticketDataClean)

    // Stats — await para garantizar que se registren antes de devolver
    try {
      await updateProductDailyStats(items, enrichment.timeSlot, paymentMethod, "POS")
    } catch (err) {
      console.error("Error updating product stats:", err)
    }

    // Puntos de fidelidad — await para detectar fallos y avisar al barista
    let loyaltyError: string | null = null
    if (selectedCustomerId) {
      const points = calculatePoints(total)
      if (points > 0) {
        try {
          await awardPoints(selectedCustomerId, points, "POS", docRef.id, `Ticket #${ticketNumber} · ${total.toFixed(2)}€`)
        } catch (err: any) {
          console.error("[Loyalty] Error awarding POS points:", err)
          loyaltyError = err?.message || "Error asignando puntos"
        }
      }
    }

    return {
      id: docRef.id,
      ...ticketData,
      fiscalData: fiscalData || undefined,
      date: Timestamp.now(),
      loyaltyError,
    }
  } catch (error: any) {
    throw new Error(`Error al añadir ticket: ${error.message}`)
  }
}

export const deleteTicket = async (orgId: string, id: string): Promise<void> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    await deleteDoc(doc(db, "orgs", orgId, "tickets", id))
  } catch (error: any) {
    throw new Error(`Error al eliminar ticket: ${error.message}`)
  }
}

export const getTicketsByUser = async (orgId: string, userId: string): Promise<Ticket[]> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const q = query(ticketsRef, where("userId", "==", userId), orderBy("ticketNumber", "desc"))
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ticket)
  } catch (error: any) {
    console.error("Error al obtener tickets por usuario:", error)
    return []
  }
}

export const getTicketsByDate = async (orgId: string, startDate: Date, endDate: Date): Promise<Ticket[]> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const q = query(
      ticketsRef,
      where("date", ">=", Timestamp.fromDate(startDate)),
      where("date", "<=", Timestamp.fromDate(endDate)),
      orderBy("date", "desc"),
    )
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ticket)
  } catch (error: any) {
    console.error("Error al obtener tickets por fecha:", error)
    return []
  }
}

export const getTotalSales = async (orgId: string, startDate?: Date, endDate?: Date): Promise<number> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const tickets = startDate && endDate ? await getTicketsByDate(orgId, startDate, endDate) : await getTickets(orgId)
    return tickets.reduce((sum, ticket) => sum + ticket.total, 0)
  } catch (error: any) {
    console.error("Error al obtener ventas totales:", error)
    return 0
  }
}

export const getRecentTickets = async (orgId: string, count = 5): Promise<Ticket[]> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const q = query(ticketsRef, orderBy("ticketNumber", "desc"), limit(count))
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ticket)
  } catch (error: any) {
    console.error("Error al obtener tickets recientes:", error)
    return []
  }
}

export const getLastTicketNumber = async (orgId: string): Promise<number> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const q = query(ticketsRef, orderBy("ticketNumber", "desc"), limit(1))
    const querySnapshot = await getDocs(q)
    if (querySnapshot.empty) return 0
    const lastTicket = querySnapshot.docs[0].data() as Ticket
    return lastTicket.ticketNumber || 0
  } catch (error: any) {
    console.error("Error al obtener último número de ticket:", error)
    throw error
  }
}

export const getTicketsPaginated = async (
  orgId: string,
  pageSize: number = 50,
  lastTicket?: Ticket
): Promise<Ticket[]> => {
  if (!db) throw new Error("Firestore no está inicializado")
  if (!orgId) throw new Error("orgId es requerido")
  try {
    const ticketsRef = getTicketsCollection(orgId)
    const constraints: QueryConstraint[] = [orderBy("ticketNumber", "desc"), limit(pageSize)]

    if (lastTicket) {
      constraints.push(startAfter(lastTicket.ticketNumber))
    }

    const q = query(ticketsRef, ...constraints)
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ticket)
  } catch (error: any) {
    console.error("Error al obtener tickets paginados:", error)
    return []
  }
}
