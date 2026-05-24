/**
 * services/quiz-catalog.ts — Dynamic quiz catalog
 * Fetches from Firestore orgs/{orgId}/quizzes, falls back to hardcoded.
 * Pattern: same as rewards-catalog.ts
 */

import type { Quiz, QuizModule, QuizModuleId } from "../types/gamification"

/** Minimal Firestore interface compatible with both client and admin SDKs */
interface FirestoreDB {
  collection(path: string): any;
  doc(path: string): any;
}

// ── Cache ──
let cache: Quiz[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

/** Get active (enabled) quizzes from Firestore with fallback */
export async function getActiveQuizzes(
  db: FirestoreDB,
  orgId: string,
): Promise<Quiz[]> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache

  try {
    // Client SDK path
    const { collection, query, where, orderBy, getDocs } = await import("firebase/firestore")
    const ref = collection(db, `orgs/${orgId}/quizzes`)
    const q = query(ref, where("enabled", "!=", false), orderBy("sortOrder", "asc"))
    const snap = await getDocs(q)

    if (snap.empty) return []

    const quizzes: Quiz[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz))
    cache = quizzes
    cacheTime = Date.now()
    return quizzes
  } catch (err) {
    console.warn("[quiz-catalog] Error fetching quizzes:", err)
    return []
  }
}

/** Get ALL quizzes (including disabled) — for Brain admin */
export async function getAllQuizzes(
  db: FirestoreDB,
  orgId: string,
): Promise<Quiz[]> {
  try {
    const { collection, query, orderBy, getDocs } = await import("firebase/firestore")
    const ref = collection(db, `orgs/${orgId}/quizzes`)
    const q = query(ref, orderBy("sortOrder", "asc"))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz))
  } catch {
    return []
  }
}

/** Group quizzes into modules */
export function groupIntoModules(quizzes: Quiz[]): QuizModule[] {
  const modules: Record<QuizModuleId, { title: string; titleEn: string; emoji: string; description: string; descriptionEn: string }> = {
    bienvenida: {
      title: "Bienvenida",
      titleEn: "Welcome",
      emoji: "👋",
      description: "Completa una sola vez para conocer el programa",
      descriptionEn: "Complete once to learn about the program",
    },
    "cafe-actual": {
      title: "Café actual",
      titleEn: "Current coffee",
      emoji: "❤️",
      description: "Conoce Amor Perfecto, trazabilidad y cómo pedir mejor",
      descriptionEn: "Learn about Amor Perfecto, traceability and how to order better",
    },
    semanal: {
      title: "Retos semanales",
      titleEn: "Weekly challenges",
      emoji: "🏆",
      description: "Un reto nuevo cada semana — espresso, leche, cata y más",
      descriptionEn: "A new challenge every week — espresso, milk, tasting and more",
    },
  }

  return (Object.keys(modules) as QuizModuleId[]).map(id => ({
    id,
    ...modules[id],
    quizzes: quizzes.filter(q => q.moduleId === id),
  }))
}

export function invalidateQuizCache(): void {
  cache = null
  cacheTime = 0
}
