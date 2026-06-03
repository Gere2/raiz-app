/**
 * product-stats-service.ts
 *
 * Actualiza automáticamente estadísticas diarias por producto.
 * Se llama después de cada ticket — usa increment() para operaciones atómicas.
 *
 * Colección (org-scoped): Raíz→`product_daily_stats` (top-level); otros cafés→
 * `orgs/{orgId}/product_daily_stats`. Doc ID: {productId}_{YYYY-MM-DD}.
 */

import {
  setDoc,
  getDocs,
  query,
  where,
  increment,
  arrayUnion,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"
import { orgCollection, orgDoc } from "./org-scope"
import type { OrderItem } from "./ticket-service"
import type { TimeSlot } from "./data-enrichment"

const STATS_COLLECTION = "product_daily_stats"

// ── Tipos ──

export interface ProductDailyStat {
  id: string                    // "{productId}_{YYYY-MM-DD}"
  productId: string
  productName: string
  category: string
  date: string                  // "YYYY-MM-DD"

  unitsSold: number
  revenue: number
  timesInOrder: number          // en cuántos pedidos apareció

  // Ventas por franja horaria
  salesByTimeSlot: {
    early_morning: number
    morning: number
    mid_morning: number
    lunch: number
    afternoon: number
    closing: number
  }

  // Ventas por método de pago
  salesByPayment: {
    CASH: number
    CARD: number
  }

  // Ventas por fuente
  salesBySource: {
    POS: number
    APP: number
  }

  // Productos con los que se combina (IDs)
  pairedProductIds: string[]

  // Metadata
  lastUpdated: any
}

// ── Helpers ──

function getDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function getDocId(productId: string, date: string): string {
  // Sanitizar productId para que sea válido como parte de un doc ID
  const safeId = productId.replace(/[\/\\]/g, "_")
  return `${safeId}_${date}`
}

// ══════════════════════════════════════
// FUNCIÓN PRINCIPAL — llamar después de addTicket
// ══════════════════════════════════════

export async function updateProductDailyStats(
  orgId: string,
  items: OrderItem[],
  timeSlot: TimeSlot,
  paymentMethod: "CASH" | "CARD",
  source: "POS" | "APP" = "POS",
): Promise<void> {
  if (!db || !orgId || items.length === 0) return

  const today = getDateString()
  const allProductIds = items.map(item => item.product.id)

  const updates = items.map(async (item) => {
    const productId = item.product.id
    const docId = getDocId(productId, today)
    const docRef = orgDoc(orgId, STATS_COLLECTION, docId)

    // Productos con los que se combina (excluyéndose a sí mismo)
    const pairedIds = allProductIds.filter(id => id !== productId)

    try {
      await setDoc(docRef, {
        // Identificación (se sobreescribe, está bien)
        productId,
        productName: item.product.name,
        category: item.product.category || "sin categoría",
        date: today,

        // Contadores atómicos
        unitsSold: increment(item.quantity),
        revenue: increment(item.product.price * item.quantity),
        timesInOrder: increment(1),

        // Franja horaria
        [`salesByTimeSlot.${timeSlot}`]: increment(item.quantity),

        // Método de pago
        [`salesByPayment.${paymentMethod}`]: increment(item.quantity),

        // Fuente
        [`salesBySource.${source}`]: increment(item.quantity),

        // Combinaciones — arrayUnion evita duplicados
        ...(pairedIds.length > 0 ? { pairedProductIds: arrayUnion(...pairedIds) } : {}),

        // Metadata
        lastUpdated: Timestamp.now(),
      }, { merge: true })
    } catch (err) {
      console.error(`Error updating stats for ${productId}:`, err)
    }
  })

  await Promise.all(updates)
}

// ══════════════════════════════════════
// CONSULTAS — para dashboards y análisis
// ══════════════════════════════════════

/** Obtener stats de un día específico */
export async function getStatsByDate(orgId: string, date: string): Promise<ProductDailyStat[]> {
  if (!db || !orgId) return []

  try {
    const q = query(
      orgCollection(orgId, STATS_COLLECTION),
      where("date", "==", date),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ProductDailyStat))
      .sort((a, b) => b.unitsSold - a.unitsSold)
  } catch (err) {
    console.error("Error fetching daily stats:", err)
    return []
  }
}

/** Obtener stats de un rango de fechas */
export async function getStatsByDateRange(
  orgId: string,
  startDate: string,
  endDate: string,
): Promise<ProductDailyStat[]> {
  if (!db || !orgId) return []

  try {
    const q = query(
      orgCollection(orgId, STATS_COLLECTION),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ProductDailyStat))
      .sort((a, b) => b.unitsSold - a.unitsSold)
  } catch (err) {
    console.error("Error fetching stats range:", err)
    return []
  }
}

/** Obtener stats de un producto específico en un rango */
export async function getProductStats(
  orgId: string,
  productId: string,
  startDate: string,
  endDate: string,
): Promise<ProductDailyStat[]> {
  if (!db || !orgId) return []

  try {
    const q = query(
      orgCollection(orgId, STATS_COLLECTION),
      where("productId", "==", productId),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ProductDailyStat))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (err) {
    console.error("Error fetching product stats:", err)
    return []
  }
}

/** Agregar stats de múltiples días en un resumen por producto */
export function aggregateStats(stats: ProductDailyStat[]): {
  productId: string
  productName: string
  category: string
  totalUnits: number
  totalRevenue: number
  totalOrders: number
  avgUnitsPerDay: number
  avgRevenuePerDay: number
  bestTimeSlot: string
  bestPaymentMethod: string
  daysActive: number
}[] {
  const map = new Map<string, {
    productId: string
    productName: string
    category: string
    totalUnits: number
    totalRevenue: number
    totalOrders: number
    dates: Set<string>
    timeSlots: Record<string, number>
    payments: Record<string, number>
  }>()

  stats.forEach(stat => {
    const existing = map.get(stat.productId) || {
      productId: stat.productId,
      productName: stat.productName,
      category: stat.category,
      totalUnits: 0,
      totalRevenue: 0,
      totalOrders: 0,
      dates: new Set<string>(),
      timeSlots: {} as Record<string, number>,
      payments: {} as Record<string, number>,
    }

    existing.totalUnits += stat.unitsSold || 0
    existing.totalRevenue += stat.revenue || 0
    existing.totalOrders += stat.timesInOrder || 0
    existing.dates.add(stat.date)

    // Acumular franjas horarias
    if (stat.salesByTimeSlot) {
      Object.entries(stat.salesByTimeSlot).forEach(([slot, count]) => {
        existing.timeSlots[slot] = (existing.timeSlots[slot] || 0) + (count || 0)
      })
    }

    // Acumular pagos
    if (stat.salesByPayment) {
      Object.entries(stat.salesByPayment).forEach(([method, count]) => {
        existing.payments[method] = (existing.payments[method] || 0) + (count || 0)
      })
    }

    map.set(stat.productId, existing)
  })

  return Array.from(map.values())
    .map(p => {
      const daysActive = p.dates.size || 1
      const bestTimeSlot = Object.entries(p.timeSlots).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown"
      const bestPaymentMethod = Object.entries(p.payments).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown"

      return {
        productId: p.productId,
        productName: p.productName,
        category: p.category,
        totalUnits: p.totalUnits,
        totalRevenue: Math.round(p.totalRevenue * 100) / 100,
        totalOrders: p.totalOrders,
        avgUnitsPerDay: Math.round((p.totalUnits / daysActive) * 10) / 10,
        avgRevenuePerDay: Math.round((p.totalRevenue / daysActive) * 100) / 100,
        bestTimeSlot,
        bestPaymentMethod,
        daysActive,
      }
    })
    .sort((a, b) => b.totalUnits - a.totalUnits)
}
