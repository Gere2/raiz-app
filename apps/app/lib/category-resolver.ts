/**
 * category-resolver.ts
 *
 * Resuelve IDs de categorías de Firestore a nombres legibles.
 * Cache en memoria con TTL de 1 hora.
 *
 * Uso:
 *   const names = await resolveCategoryNames(["QVLwqtAS7F72BqSGA7jg"])
 *   // → ["Cafés"]
 */

import { collection, getDocs } from "firebase/firestore"
import { db } from "./firebase"

// ── Cache ──
let categoryCache: Map<string, string> | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

/**
 * Carga todas las categorías y cachea id → name.
 */
export async function loadCategoryMap(): Promise<Map<string, string>> {
  if (categoryCache && (Date.now() - cacheLoadedAt) < CACHE_TTL_MS) {
    return categoryCache
  }

  try {
    const snap = await getDocs(collection(db, "categories"))
    const map = new Map<string, string>()
    snap.forEach(doc => {
      const data = doc.data()
      map.set(doc.id, data.name || data.nombre || doc.id)
    })
    categoryCache = map
    cacheLoadedAt = Date.now()
    return map
  } catch (err) {
    console.warn("[Categories] Error loading:", err)
    return categoryCache || new Map()
  }
}

/**
 * Resuelve una lista de category IDs a nombres legibles.
 */
export async function resolveCategoryNames(categoryIds: string[]): Promise<string[]> {
  const map = await loadCategoryMap()
  return categoryIds.map(id => map.get(id) || id)
}

/**
 * Fuerza recarga del cache.
 */
export function invalidateCategoryCache() {
  categoryCache = null
  cacheLoadedAt = 0
}
