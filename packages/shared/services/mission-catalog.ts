/**
 * services/mission-catalog.ts — Dynamic mission catalog
 * Fetches from Firestore orgs/{orgId}/missions, falls back to hardcoded.
 */

import type { Mission } from "../types/gamification"

/** Minimal Firestore interface compatible with both client and admin SDKs */
interface FirestoreDB {
  collection(path: string): any;
  doc(path: string): any;
}

// ── Cache ──
let cache: Mission[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

/** Get active (enabled) missions from Firestore with fallback */
export async function getActiveMissions(
  db: FirestoreDB,
  orgId: string,
): Promise<Mission[]> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache

  try {
    const { collection, query, where, orderBy, getDocs } = await import("firebase/firestore")
    const ref = collection(db, `orgs/${orgId}/missions`)
    const q = query(ref, where("enabled", "!=", false), orderBy("priority", "asc"))
    const snap = await getDocs(q)

    if (snap.empty) return []

    const missions: Mission[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Mission))
    cache = missions
    cacheTime = Date.now()
    return missions
  } catch (err) {
    console.warn("[mission-catalog] Error fetching missions:", err)
    return []
  }
}

/** Get ALL missions (including disabled) — for Brain admin */
export async function getAllMissions(
  db: FirestoreDB,
  orgId: string,
): Promise<Mission[]> {
  try {
    const { collection, query, orderBy, getDocs } = await import("firebase/firestore")
    const ref = collection(db, `orgs/${orgId}/missions`)
    const q = query(ref, orderBy("priority", "asc"))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Mission))
  } catch {
    return []
  }
}

export function invalidateMissionCache(): void {
  cache = null
  cacheTime = 0
}
