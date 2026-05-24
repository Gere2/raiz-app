/**
 * category-resolver.ts (shared)
 *
 * Resuelve IDs de categorías de Firestore a nombres legibles.
 * Cache en memoria con TTL de 1 hora.
 *
 * Uso:
 *   import { db } from "./firebase"
 *   import { createCategoryResolver } from "@raiz/shared/category-resolver"
 *   const resolver = createCategoryResolver(db)
 *   const names = await resolver.resolveCategoryNames(["QVLwqtAS7F72BqSGA7jg"])
 *   // → ["Cafés"]
 */

import { collection, getDocs, Firestore } from "firebase/firestore"

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

/**
 * Creates a category resolver bound to a specific Firestore instance.
 * This avoids the circular dependency on the firebase module.
 */
export function createCategoryResolver(db: Firestore) {
  let categoryCache: Map<string, string> | null = null
  let cacheLoadedAt = 0

  async function loadCategoryMap(): Promise<Map<string, string>> {
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

  async function resolveCategoryNames(categoryIds: string[]): Promise<string[]> {
    const map = await loadCategoryMap()
    return categoryIds.map(id => map.get(id) || id)
  }

  function invalidateCategoryCache() {
    categoryCache = null
    cacheLoadedAt = 0
  }

  return { loadCategoryMap, resolveCategoryNames, invalidateCategoryCache }
}
