import { RAIZ_ORG_ID } from "@/lib/tenant";
/**
 * customer-profile-service.ts
 * 
 * Actualiza automáticamente un perfil de cliente con cada compra.
 * Colección: customer_profiles
 * Doc ID: customerUid (APP) o "pos_anon" para POS anónimos agregados
 */

import {
  doc,
  getDoc,
  setDoc,
  increment,
  arrayUnion,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore"
import { db, auth } from "@/lib/firebase"

// ── Tipos ──

export interface CustomerProfile {
  id: string
  type: "app" | "teacher" | "pos_anonymous"
  email?: string
  name?: string
  uid?: string

  totalVisits: number
  totalSpent: number
  avgTicket: number
  lastVisit: unknown
  firstVisit: unknown

  favoriteProducts: string[]
  preferredPaymentMethod: string
  preferredTimeSlot: string
  preferredDayOfWeek: number
  visitsByDayOfWeek: Record<string, number>
  visitsByTimeSlot: Record<string, number>
  paymentCounts: Record<string, number>

  segment: string
  lastSegmentUpdate?: unknown
  updatedAt: unknown
  createdAt: unknown
}

// ── Segmentación ──
function calculateSegment(totalVisits: number, daysSinceLastVisit: number): string {
  if (totalVisits <= 2) return "new"
  if (daysSinceLastVisit > 21 && totalVisits > 5) return "churning"
  if (daysSinceLastVisit > 30) return "churning"
  if (totalVisits <= 5) return "occasional"
  if (totalVisits <= 15) return "regular"
  return "loyal"
}

function getTimeSlot(hour: number): string {
  if (hour < 9) return "early_morning"
  if (hour < 11) return "morning"
  if (hour < 13) return "mid_morning"
  if (hour < 15) return "lunch"
  if (hour < 17) return "afternoon"
  return "closing"
}

// ══════════════════════════════════════
// ACTUALIZAR PERFIL — llamar después de cada pedido APP
// ══════════════════════════════════════

export async function updateCustomerProfile(order: {
  customerUid: string
  customerName?: string
  customerEmail?: string
  total: number
  items: Array<{ productName?: string; name?: string; qty?: number; quantity?: number }>
  paymentMethod: string
  source?: string
}): Promise<void> {
  if (!db || !order.customerUid) return

  const profileId = order.customerUid
  const docRef = doc(db, "customer_profiles", profileId)
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7
  const timeSlot = getTimeSlot(now.getHours())

  const productNames = order.items
    .map(i => i.productName ?? "unknown")
    .filter(Boolean)

  try {
    const existing = await getDoc(docRef)

    if (existing.exists()) {
      const data = existing.data()
      const newTotalVisits = (data.totalVisits || 0) + 1
      const newTotalSpent = (data.totalSpent || 0) + order.total
      const newAvgTicket = Math.round((newTotalSpent / newTotalVisits) * 100) / 100

      const paymentCounts = data.paymentCounts || {}
      paymentCounts[order.paymentMethod] = (paymentCounts[order.paymentMethod] || 0) + 1
      const preferredPaymentMethod = Object.entries(paymentCounts)
        .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || order.paymentMethod

      const visitsByDayOfWeek = data.visitsByDayOfWeek || {}
      visitsByDayOfWeek[dayOfWeek.toString()] = (visitsByDayOfWeek[dayOfWeek.toString()] || 0) + 1
      const preferredDayOfWeek = Number(
        Object.entries(visitsByDayOfWeek).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || dayOfWeek
      )

      const visitsByTimeSlot = data.visitsByTimeSlot || {}
      visitsByTimeSlot[timeSlot] = (visitsByTimeSlot[timeSlot] || 0) + 1
      const preferredTimeSlot = Object.entries(visitsByTimeSlot)
        .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || timeSlot

      // Calculate actual days since last visit
      const lastVisitDate = data.lastVisit?.toDate?.() || new Date()
      const daysSinceLastVisit = Math.floor((now.getTime() - lastVisitDate.getTime()) / 86400000)
      const segment = calculateSegment(newTotalVisits, daysSinceLastVisit)

      await setDoc(docRef, {
        orgId: data.orgId || RAIZ_ORG_ID,
        totalVisits: increment(1),
        totalSpent: increment(order.total),
        avgTicket: newAvgTicket,
        lastVisit: Timestamp.now(),
        name: order.customerName || data.name,
        email: order.customerEmail || data.email,
        favoriteProducts: arrayUnion(...productNames.slice(0, 5)),
        preferredPaymentMethod,
        preferredDayOfWeek,
        preferredTimeSlot,
        visitsByDayOfWeek,
        visitsByTimeSlot,
        paymentCounts,
        segment,
        lastSegmentUpdate: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true })
    } else {
      await setDoc(docRef, {
        id: profileId,
        orgId: RAIZ_ORG_ID,
        type: order.source === "APP" ? "app" : "pos_anonymous",
        uid: order.customerUid,
        email: order.customerEmail || null,
        name: order.customerName || null,
        totalVisits: 1,
        totalSpent: order.total,
        avgTicket: order.total,
        lastVisit: Timestamp.now(),
        firstVisit: Timestamp.now(),
        favoriteProducts: productNames.slice(0, 5),
        preferredPaymentMethod: order.paymentMethod,
        preferredTimeSlot: timeSlot,
        preferredDayOfWeek: dayOfWeek,
        visitsByDayOfWeek: { [dayOfWeek.toString()]: 1 },
        visitsByTimeSlot: { [timeSlot]: 1 },
        paymentCounts: { [order.paymentMethod]: 1 },
        segment: "new",
        lastSegmentUpdate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    }
  } catch (err) {
    // SECURITY: Propagate errors instead of silently failing
    console.error("[CustomerProfile] Error updating customer profile:", err)
    throw err
  }
}

// ══════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════

export async function getCustomerProfile(uid: string): Promise<CustomerProfile | null> {
  if (!db) return null
  // Security: Verify that the requested uid matches the currently authenticated user
  const currentUser = auth.currentUser
  if (!currentUser || currentUser.uid !== uid) {
    console.warn(`[CustomerProfile] Unauthorized access attempt: requested ${uid}, authenticated as ${currentUser?.uid}`)
    return null
  }
  try {
    const snap = await getDoc(doc(db, "customer_profiles", uid))
    if (snap.exists()) return { id: snap.id, ...snap.data() } as CustomerProfile
    return null
  } catch { return null }
}

export async function getAllProfiles(orgId: string = RAIZ_ORG_ID): Promise<CustomerProfile[]> {
  if (!db) return []
  try {
    // Note: This query requires a composite index on customer_profiles:
    // [orgId ASC, totalVisits DESC] for optimal performance
    const q = query(
      collection(db, "customer_profiles"),
      where("orgId", "==", orgId),
      orderBy("totalVisits", "desc"),
      limit(100)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerProfile))
  } catch { return [] }
}

export async function getProfilesBySegment(segment: string, orgId: string = RAIZ_ORG_ID): Promise<CustomerProfile[]> {
  if (!db) return []
  try {
    const q = query(
      collection(db, "customer_profiles"),
      where("orgId", "==", orgId),
      where("segment", "==", segment)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerProfile))
  } catch { return [] }
}
