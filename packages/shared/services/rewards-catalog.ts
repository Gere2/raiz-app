/**
 * services/rewards-catalog.ts — Catálogo de rewards dinámico
 *
 * Lee de Firestore con fallback a constantes hardcoded.
 * Usado por la App para mostrar rewards y por Brain para gobernarlos.
 */

import { collection, getDocs, query, where, type Firestore } from "firebase/firestore"
import type { Reward } from "../types/reward"

/** Catálogo de fallback (idéntico al hardcoded actual) */
const FALLBACK_REWARDS: Reward[] = [
  { id: "free-upgrade", name: "Upgrade de bebida", nameEn: "Drink upgrade", description: "Leche especial o extra shot gratis en tu bebida", descriptionEn: "Special milk or free extra shot in your drink", pointsCost: 400, emoji: "✨", category: "drinks", enabled: true },
  { id: "free-snack", name: "Snack pequeño", nameEn: "Small snack", description: "Una galleta o mini bollería de nuestra vitrina", descriptionEn: "A cookie or mini pastry from our display", pointsCost: 700, emoji: "🍪", category: "food", enabled: true },
  { id: "free-drink", name: "Bebida gratis", nameEn: "Free drink", description: "Café estándar de la carta: espresso, americano, latte...", descriptionEn: "Standard menu coffee: espresso, americano, latte...", pointsCost: 1500, emoji: "☕", category: "drinks", enabled: true },
  { id: "combo", name: "Combo café + snack", nameEn: "Coffee + snack combo", description: "Una bebida estándar + un snack de la vitrina", descriptionEn: "A standard drink + a snack from the display", pointsCost: 2000, emoji: "🥐", category: "food", enabled: true },
  { id: "reusable-cup", name: "Vaso reutilizable / taza de marca", nameEn: "Reusable cup / branded mug", description: "Tu propio vaso reutilizable con el logo de Raíz y Grano", descriptionEn: "Your own reusable cup with the Raíz y Grano logo", pointsCost: 4500, emoji: "🥤", category: "merch", enabled: true },
  { id: "masterclass", name: "Cata / experiencia en campus", nameEn: "Tasting / campus experience", description: "Una sesión de cata breve sobre café de especialidad (plazas limitadas)", descriptionEn: "A short tasting session on specialty coffee (limited spots)", pointsCost: 8000, emoji: "🎓", category: "experience", enabled: true },
  { id: "coffee-sampler", name: "Pack 'Sampler' para casa", nameEn: "Home sampler pack", description: "Selección de 3 orígenes para probar en casa (50g cada uno)", descriptionEn: "Selection of 3 origins to try at home (50g each)", pointsCost: 10000, emoji: "🎁", category: "merch", enabled: true },
  { id: "coffee-bag", name: "Bolsa de café 250g (Amor Perfecto)", nameEn: "250g coffee bag (Amor Perfecto)", description: "Una bolsa de 250g de café Amor Perfecto, selección del momento", descriptionEn: "A 250g bag of Amor Perfecto coffee, current selection", pointsCost: 12000, emoji: "📦", category: "merch", enabled: true },
]

/** Cache en memoria con TTL */
let cachedRewards: Reward[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Obtiene rewards activos desde Firestore con fallback a hardcoded
 */
export async function getActiveRewards(db: Firestore, orgId: string): Promise<Reward[]> {
  // Cache hit
  if (cachedRewards && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedRewards
  }

  try {
    const ref = collection(db, `orgs/${orgId}/rewards_catalog`)
    const q = query(ref, where("enabled", "==", true))
    const snap = await getDocs(q)

    if (snap.empty) {
      // No hay rewards en Firestore → usar fallback
      cachedRewards = FALLBACK_REWARDS
    } else {
      cachedRewards = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Reward))
        .sort((a, b) => (a.sortOrder ?? a.pointsCost) - (b.sortOrder ?? b.pointsCost))
    }

    cacheTimestamp = Date.now()
    return cachedRewards
  } catch (err) {
    console.warn("[RewardsCatalog] Error fetching, using fallback:", err)
    return FALLBACK_REWARDS
  }
}

/**
 * Obtiene TODOS los rewards (activos e inactivos) — para Brain admin
 */
export async function getAllRewards(db: Firestore, orgId: string): Promise<Reward[]> {
  try {
    const ref = collection(db, `orgs/${orgId}/rewards_catalog`)
    const snap = await getDocs(ref)

    if (snap.empty) return FALLBACK_REWARDS

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Reward))
      .sort((a, b) => (a.sortOrder ?? a.pointsCost) - (b.sortOrder ?? b.pointsCost))
  } catch (err) {
    console.warn("[RewardsCatalog] Error fetching all:", err)
    return FALLBACK_REWARDS
  }
}

/** Invalida la cache (llamar tras edición en Brain) */
export function invalidateRewardsCache() {
  cachedRewards = null
  cacheTimestamp = 0
}

/** Exporta fallback para seed scripts */
export { FALLBACK_REWARDS }
