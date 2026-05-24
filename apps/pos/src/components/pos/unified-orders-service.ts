import { collection, query, onSnapshot, Timestamp, where, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"

export interface UnifiedOrder {
  id: string
  source: "POS" | "APP"
  total: number
  status: string
  createdAt: Date
  customerName?: string
  customerEmail?: string
  paymentMethod?: string
  pickupTime?: string
  notes?: string
  ticketNumber?: number
  userId?: string
  userName?: string
  fiscalData?: any
  items: Array<{
    name: string
    qty: number
    unitPrice: number
  }>
}

function toDate(val: any): Date {
  if (!val) return new Date(0)
  if (val instanceof Timestamp) return val.toDate()
  if (val.toDate) return val.toDate()
  if (typeof val === "string" || typeof val === "number") return new Date(val)
  return new Date(0)
}

function normalizeTicket(id: string, data: any): UnifiedOrder {
  return {
    id,
    source: "POS",
    total: data.total ?? 0,
    status: "COMPLETED",
    createdAt: toDate(data.createdAt || data.date),
    ticketNumber: data.ticketNumber,
    userId: data.userId,
    userName: data.userName,
    fiscalData: data.fiscalData,
    items: (data.items || []).map((item: any) => ({
      name: item.name || item.productName || "?",
      qty: item.quantity || item.qty || 1,
      unitPrice: item.price || item.unitPrice || 0,
    })),
  }
}

function normalizeOrder(id: string, data: any): UnifiedOrder {
  return {
    id,
    source: "APP",
    total: data.total ?? data.items?.reduce((s: number, i: any) => s + (i.unitPrice || 0) * (i.qty || 0), 0) ?? 0,
    status: data.status || "IN_QUEUE",
    createdAt: toDate(data.createdAt),
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    paymentMethod: data.paymentMethod,
    pickupTime: data.pickupTime,
    notes: data.notes,
    items: (data.items || []).map((item: any) => ({
      name: item.name || item.productName || "?",
      qty: item.quantity || item.qty || 1,
      unitPrice: item.price || item.unitPrice || 0,
    })),
  }
}

export function subscribeToAllOrders(options: {
  onData: (orders: UnifiedOrder[]) => void
  onError?: (err: Error) => void
}): () => void {
  let ticketsList: UnifiedOrder[] = []
  let ordersList: UnifiedOrder[] = []
  let ticketsLoaded = false
  let ordersLoaded = false

  const merge = () => {
    if (!ticketsLoaded || !ordersLoaded) return
    const combined = [...ticketsList, ...ordersList]
    combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    console.log(`[Dashboard] ${ticketsList.length} tickets POS + ${ordersList.length} orders APP = ${combined.length} total`)
    options.onData(combined)
  }

  // Con limit (y orderBy cuando aplique) para no traer TODO.
  const ticketsQ = query(collection(db, "tickets"), orderBy("ticketNumber","desc"), limit(300))
  const ordersQ = query(collection(db, "orders"), where("source","==","APP"), orderBy("createdAt","desc"), limit(300))

  const unsubTickets = onSnapshot(ticketsQ, (snap) => {
    ticketsList = snap.docs.map((doc) => normalizeTicket(doc.id, doc.data()))
    ticketsLoaded = true
    merge()
  }, (err) => {
    console.error("Error tickets:", err)
    ticketsLoaded = true
    merge()
  })

  const unsubOrders = onSnapshot(ordersQ, (snap) => {
    ordersList = snap.docs.map((doc) => normalizeOrder(doc.id, doc.data()))
    ordersLoaded = true
    merge()
  }, (err) => {
    console.error("Error orders:", err)
    ordersLoaded = true
    merge()
  })

  return () => {
    unsubTickets()
    unsubOrders()
  }
}
