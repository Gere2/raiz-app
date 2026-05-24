/**
 * rewards-service.ts
 *
 * Catálogo de recompensas y sistema de canje.
 * El usuario canjea puntos → genera un código de 6 caracteres → el barista lo valida en POS.
 */

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  increment,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

// ── Catálogo de recompensas ──

export interface Reward {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  pointsCost: number
  emoji: string
  category: "drinks" | "food" | "merch" | "experience"
  enabled: boolean
}

/**
 * REWARDS_CATALOG — Catálogo de referencia para seeding inicial.
 *
 * IMPORTANTE: Este catálogo NO se usa como fallback en runtime.
 * Solo se usa para seedear Firestore la primera vez.
 * Los valores de puntaje están calibrados para una tasa de retorno del ~10%:
 *   - 1€ gastado = 100 puntos
 *   - Para canjear un premio de X€, se necesitan ~X × 10 × 100 puntos
 *     (es decir, gastar ~10× el valor del premio)
 */
export const REWARDS_CATALOG: Reward[] = [
  {
    id: "free-upgrade",
    name: "Upgrade de bebida",
    nameEn: "Drink upgrade",
    description: "Leche especial o extra shot gratis en tu bebida",
    descriptionEn: "Special milk or free extra shot in your drink",
    pointsCost: 800,
    emoji: "✨",
    category: "drinks",
    enabled: true,
  },
  {
    id: "free-snack",
    name: "Snack pequeño",
    nameEn: "Small snack",
    description: "Una galleta o mini bollería de nuestra vitrina",
    descriptionEn: "A cookie or mini pastry from our display",
    pointsCost: 2000,
    emoji: "🍪",
    category: "food",
    enabled: true,
  },
  {
    id: "free-drink",
    name: "Bebida gratis",
    nameEn: "Free drink",
    description: "Café estándar de la carta: espresso, americano, latte...",
    descriptionEn: "Standard menu coffee: espresso, americano, latte...",
    pointsCost: 3000,
    emoji: "☕",
    category: "drinks",
    enabled: true,
  },
  {
    id: "combo",
    name: "Combo café + snack",
    nameEn: "Coffee + snack combo",
    description: "Una bebida estándar + un snack de la vitrina",
    descriptionEn: "A standard drink + a snack from the display",
    pointsCost: 5000,
    emoji: "🥐",
    category: "food",
    enabled: true,
  },
  {
    id: "reusable-cup",
    name: "Vaso reutilizable / taza de marca",
    nameEn: "Reusable cup / branded mug",
    description: "Tu propio vaso reutilizable con el logo de Raíz y Grano",
    descriptionEn: "Your own reusable cup with the Raíz y Grano logo",
    pointsCost: 8000,
    emoji: "🥤",
    category: "merch",
    enabled: true,
  },
  {
    id: "masterclass",
    name: "Cata / experiencia en campus",
    nameEn: "Tasting / campus experience",
    description: "Una sesión de cata breve sobre café de especialidad (plazas limitadas)",
    descriptionEn: "A short tasting session on specialty coffee (limited spots)",
    pointsCost: 15000,
    emoji: "🎓",
    category: "experience",
    enabled: true,
  },
  {
    id: "coffee-sampler",
    name: "Pack 'Sampler' para casa",
    nameEn: "Home sampler pack",
    description: "Selección de 3 orígenes para probar en casa (50g cada uno)",
    descriptionEn: "Selection of 3 origins to try at home (50g each)",
    pointsCost: 12000,
    emoji: "🎁",
    category: "merch",
    enabled: true,
  },
  {
    id: "coffee-bag",
    name: "Bolsa de café 250g (Amor Perfecto)",
    nameEn: "250g coffee bag (Amor Perfecto)",
    description: "Una bolsa de 250g de café Amor Perfecto, selección del momento",
    descriptionEn: "A 250g bag of Amor Perfecto coffee, current selection",
    pointsCost: 10000,
    emoji: "📦",
    category: "merch",
    enabled: true,
  },
]

// ── Tipos de redención ──

export interface Redemption {
  id?: string
  uid: string
  orgId?: string
  rewardId: string
  rewardName: string
  pointsSpent: number
  code: string // 6-char alphanumeric
  status: "pending" | "used" | "expired"
  createdAt: unknown
  usedAt?: unknown
  expiresAt: unknown
}

// ── Catálogo dinámico — lee de Firestore con fallback ──

const DEFAULT_ORG_ID = "raiz_y_grano"

/** Cache para rewards dinámicos */
let _rewardsCache: Reward[] | null = null
let _rewardsCacheTs = 0
const REWARDS_CACHE_TTL = 5 * 60 * 1000 // 5 min

/** Fetch active rewards from Firestore with cache and fallback */
async function fetchActiveRewards(): Promise<Reward[]> {
  if (_rewardsCache && Date.now() - _rewardsCacheTs < REWARDS_CACHE_TTL) {
    return _rewardsCache
  }
  try {
    const ref = collection(db, `orgs/${DEFAULT_ORG_ID}/rewards_catalog`)
    const q = query(ref, where("enabled", "==", true))
    const snap = await getDocs(q)
    if (snap.empty) return []
    const rewards = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Reward))
      .sort((a, b) => (((a as unknown as Record<string, number>).sortOrder) ?? a.pointsCost) - (((b as unknown as Record<string, number>).sortOrder) ?? b.pointsCost))
    _rewardsCache = rewards
    _rewardsCacheTs = Date.now()
    return rewards
  } catch (err) {
    console.warn("[RewardsCatalog] Error fetching, using fallback:", err)
    return []
  }
}

/**
 * Obtiene el catálogo de rewards activos.
 * Lee EXCLUSIVAMENTE de Firestore (orgs/{orgId}/rewards_catalog).
 * El catálogo hardcoded REWARDS_CATALOG solo se usa para seeding inicial,
 * NUNCA como fallback en runtime — para respetar el estado enabled/disabled
 * configurado en Brain.
 *
 * Si Firestore falla o no tiene datos, devuelve [] (vacío) en lugar de
 * caer al catálogo hardcoded que ignora el estado de Brain.
 */
export async function getRewardsCatalog(): Promise<Reward[]> {
  if (!db) return []
  try {
    return await fetchActiveRewards()
  } catch {
    return []
  }
}

// ── Generar código de canje (6 caracteres, alfanumérico mayúsculas) ──

function generateRedemptionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sin I/O/0/1 para evitar confusión
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ── Canjear recompensa ──

export async function redeemReward(
  uid: string,
  rewardId: string,
): Promise<{ success: boolean; code?: string; error?: string; newBadges?: string[] }> {
  if (!uid) return { success: false, error: "No autenticado" }

  // ── V2: Server-side redemption (atomic, idempotent) ──
  const { useServerLoyalty: isServerLoyalty, serverRedeemReward } = await import("./server-loyalty")
  if (isServerLoyalty()) {
    const res = await serverRedeemReward(uid, rewardId)
    if (!res.ok) return { success: false, error: res.error }
    return { success: true, code: res.data?.code, newBadges: [] }
  }

  // ── Legacy: Client-side Firestore writes (fallback) ──
  if (!db) return { success: false, error: "No autenticado" }

  // Buscar en catálogo dinámico primero, luego fallback
  const catalog = await getRewardsCatalog()
  const reward = catalog.find(r => r.id === rewardId)
  if (!reward || !reward.enabled) return { success: false, error: "Recompensa no disponible" }

  // Verificar saldo
  const profileRef = doc(db, "customer_profiles", uid)
  const profileSnap = await getDoc(profileRef)
  if (!profileSnap.exists()) return { success: false, error: "Perfil no encontrado" }

  const currentPoints = profileSnap.data().loyaltyPoints || 0
  if (currentPoints < reward.pointsCost) {
    return { success: false, error: "Puntos insuficientes" }
  }

  // Generar código único
  const code = generateRedemptionCode()

  // Guardar redención (incluye orgId para que el POS pueda validar con filtro de org)
  const redemption: Omit<Redemption, "id"> = {
    uid,
    orgId: DEFAULT_ORG_ID,
    rewardId: reward.id,
    rewardName: reward.name,
    pointsSpent: reward.pointsCost,
    code,
    status: "pending",
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)), // 48h
  }

  await addDoc(collection(db, "redemptions"), redemption)

  // Descontar puntos e incrementar contador de redenciones
  await setDoc(profileRef, {
    loyaltyPoints: increment(-reward.pointsCost),
    totalRedemptions: increment(1),
    updatedAt: Timestamp.now(),
  }, { merge: true })

  // Si canjeó un vaso reutilizable, marcar en perfil
  if (rewardId === "reusable-cup") {
    await setDoc(profileRef, { hasReusableCup: true }, { merge: true })
  }

  // Gamificación: detectar badges y misiones tras el canje
  let newBadges: string[] = []
  try {
    const { checkAndUnlockBadges, checkAndCompleteMissions } = await import("./gamification/firebase-service")
    newBadges = await checkAndUnlockBadges(uid)
    await checkAndCompleteMissions(uid)
  } catch (gamErr) {
    console.warn("[Rewards] Gamification side-effect error:", gamErr)
  }

  return { success: true, code, newBadges }
}

// ── Obtener redenciones activas del usuario ──

export async function getActiveRedemptions(uid: string): Promise<Redemption[]> {
  if (!db || !uid) return []

  try {
    const q = query(
      collection(db, "redemptions"),
      where("uid", "==", uid),
      where("status", "==", "pending"),
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption))
  } catch (err) {
    console.error("[Rewards] Error fetching redemptions:", err)
    return []
  }
}

// ── Obtener historial de redenciones ──

export async function getRedemptionHistory(uid: string): Promise<Redemption[]> {
  if (!db || !uid) return []

  try {
    const q = query(
      collection(db, "redemptions"),
      where("uid", "==", uid),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Redemption))
      .sort((a, b) => {
        const aTime = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0
        const bTime = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0
        return bTime - aTime
      })
  } catch (err) {
    console.error("[Rewards] Error fetching history:", err)
    return []
  }
}
