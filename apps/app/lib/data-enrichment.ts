/**
 * data-enrichment.ts v3
 * Enriquecimiento completo: temporal + pedido + clima + calendario + categorías + combinaciones.
 */

import { fetchCurrentWeather, getUniversityCalendar, type WeatherData } from "./weather-enrichment"
import { resolveCategoryNames } from "./category-resolver"

export type TimeSlot = "early_morning" | "morning" | "mid_morning" | "lunch" | "afternoon" | "closing"

function getTimeSlot(hour: number): TimeSlot {
  if (hour < 9) return "early_morning"
  if (hour < 11) return "morning"
  if (hour < 13) return "mid_morning"
  if (hour < 15) return "lunch"
  if (hour < 17) return "afternoon"
  return "closing"
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

const DRINK_CATEGORIES = ["bebidas", "cafés", "café", "drinks", "zumos", "batidos", "infusiones"]
const FOOD_CATEGORIES = ["comida", "food", "bollería", "pasteles", "bocadillos", "tostadas", "snacks"]

function detectCombo(categoryNames: string[]): boolean {
  const lc = categoryNames.map(c => c.toLowerCase())
  return lc.some(c => DRINK_CATEGORIES.some(dc => c.includes(dc))) &&
         lc.some(c => FOOD_CATEGORIES.some(fc => c.includes(fc)))
}

function generateItemPairs(items: Array<{ product: { name: string } }>): {
  itemPairs: string[]; itemPairCount: number; hasMultipleItems: boolean
} {
  const uniqueNames = Array.from(new Set(items.map(i => i.product.name))).sort()
  if (uniqueNames.length < 2) return { itemPairs: [], itemPairCount: 0, hasMultipleItems: false }
  const pairs: string[] = []
  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      pairs.push(`${uniqueNames[i]} + ${uniqueNames[j]}`)
    }
  }
  return { itemPairs: pairs, itemPairCount: pairs.length, hasMultipleItems: true }
}

export async function enrichTransactionAsync(
  items: Array<{ product: { name: string; price: number; category?: string }; quantity: number }>,
  source: "POS" | "APP" = "POS",
  queueSize: number = 0,
) {
  const now = new Date()
  const hour = now.getHours()
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const categoryIds = items.map(i => i.product.category || "sin categoría").filter((v, i, a) => a.indexOf(v) === i)

  let categoryNames: string[]
  if (categoryIds.length === 0) {
    categoryNames = []
  } else {
    try { categoryNames = await resolveCategoryNames(categoryIds) } catch { categoryNames = categoryIds }
  }

  let weather: WeatherData
  try { weather = await fetchCurrentWeather() } catch {
    weather = { temperature: 15, apparentTemperature: 13, humidity: 50, precipitation: 0, windSpeed: 10, weatherCode: 0, weatherCondition: "clear", isRainy: false, isCold: false, isHot: false, weatherBand: "mild" }
  }

  const calendar = getUniversityCalendar(now)
  const pairings = generateItemPairs(items)

  return {
    dayOfWeek: (now.getDay() + 6) % 7, hourOfDay: hour, minuteOfDay: hour * 60 + now.getMinutes(),
    timeSlot: getTimeSlot(hour), weekNumber: getWeekNumber(now), monthOfYear: now.getMonth() + 1,
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    isHoliday: calendar.campusActivity === "closed", schoolPeriod: calendar.academicPeriod,
    academicPeriod: calendar.academicPeriod, academicWeek: calendar.academicWeek, semester: calendar.semester,
    isExamWeek: calendar.isExamWeek, isFirstWeekOfClasses: calendar.isFirstWeekOfClasses,
    isLastWeekOfClasses: calendar.isLastWeekOfClasses, isPreHoliday: calendar.isPreHoliday,
    isPostHoliday: calendar.isPostHoliday, campusActivity: calendar.campusActivity, season: calendar.season,
    weatherTemp: Math.round(weather.temperature * 10) / 10,
    weatherApparentTemp: Math.round(weather.apparentTemperature * 10) / 10,
    weatherHumidity: weather.humidity, weatherPrecipitation: weather.precipitation,
    weatherWindSpeed: Math.round(weather.windSpeed * 10) / 10,
    weatherCondition: weather.weatherCondition, weatherBand: weather.weatherBand,
    isRainy: weather.isRainy, isCold: weather.isCold, isHot: weather.isHot,
    itemCount, uniqueItems: items.length, uniqueCategories: categoryIds,
    categoryNames, avgItemPrice: itemCount > 0 ? Math.round((total / itemCount) * 100) / 100 : 0,
    hasCombo: detectCombo(categoryNames),
    itemPairs: pairings.itemPairs, itemPairCount: pairings.itemPairCount, hasMultipleItems: pairings.hasMultipleItems,
    source, queueSize,
  }
}

export function enrichTransaction(
  items: Array<{ product: { name: string; price: number; category?: string }; quantity: number }>,
  source: "POS" | "APP" = "POS", queueSize: number = 0,
) {
  const now = new Date()
  const hour = now.getHours()
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const categories = items.map(i => i.product.category || "sin categoría").filter((v, i, a) => a.indexOf(v) === i)
  const pairings = generateItemPairs(items)
  return {
    dayOfWeek: (now.getDay() + 6) % 7, hourOfDay: hour, minuteOfDay: hour * 60 + now.getMinutes(),
    timeSlot: getTimeSlot(hour), weekNumber: getWeekNumber(now), monthOfYear: now.getMonth() + 1,
    isWeekend: now.getDay() === 0 || now.getDay() === 6, isHoliday: false, schoolPeriod: "classes",
    itemCount, uniqueItems: items.length, uniqueCategories: categories, categoryNames: categories,
    avgItemPrice: itemCount > 0 ? Math.round((total / itemCount) * 100) / 100 : 0,
    hasCombo: detectCombo(categories),
    itemPairs: pairings.itemPairs, itemPairCount: pairings.itemPairCount, hasMultipleItems: pairings.hasMultipleItems,
    source, queueSize,
  }
}

export function getCustomerType(source: "POS" | "APP", isTeacher: boolean = false): string {
  if (isTeacher) return "teacher"
  if (source === "APP") return "app_registered"
  return "anonymous_pos"
}
