/**
 * enrich-app-order.ts v3.1
 * Enrichment para pedidos APP — con weather + calendario + categorías + combinaciones + userType.
 */

import { enrichTransactionAsync, getCustomerType } from "./data-enrichment"
import { db } from "./firebase"
import { doc, getDoc } from "firebase/firestore"

interface AppCartItem {
  product: { id: string; name: string; price: number; category?: string }
  qty: number
}

async function fetchUserType(uid?: string): Promise<string> {
  if (!uid) return "unknown"
  try {
    const snap = await getDoc(doc(db, "customer_profiles", uid))
    if (snap.exists()) {
      return snap.data().userType || "unknown"
    }
  } catch (err) {
    console.warn("Could not fetch userType for", uid, err)
  }
  return "unknown"
}

export async function enrichAppOrder(items: AppCartItem[], uid?: string) {
  const normalizedItems = items.map(i => ({
    product: {
      name: i.product.name,
      price: i.product.price,
      category: i.product.category,
    },
    quantity: i.qty,
  }))

  // Fetch enrichment + userType in parallel
  const [enrichment, userType] = await Promise.all([
    enrichTransactionAsync(normalizedItems, "APP"),
    fetchUserType(uid),
  ])

  const customerType = getCustomerType("APP")

  return {
    dayOfWeek: enrichment.dayOfWeek,
    hourOfDay: enrichment.hourOfDay,
    minuteOfDay: enrichment.minuteOfDay,
    timeSlot: enrichment.timeSlot,
    weekNumber: enrichment.weekNumber,
    monthOfYear: enrichment.monthOfYear,
    isWeekend: enrichment.isWeekend,
    isHoliday: enrichment.isHoliday,
    schoolPeriod: enrichment.schoolPeriod,
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
    itemCount: enrichment.itemCount,
    uniqueItems: enrichment.uniqueItems,
    uniqueCategories: enrichment.uniqueCategories,
    categoryNames: enrichment.categoryNames,
    avgItemPrice: enrichment.avgItemPrice,
    hasCombo: enrichment.hasCombo,
    itemPairs: enrichment.itemPairs,
    itemPairCount: enrichment.itemPairCount,
    hasMultipleItems: enrichment.hasMultipleItems,
    customerType,
    userType,
    source: "APP",
    queueSize: enrichment.queueSize,
  }
}
