/**
 * POST /api/org/:orgId/missions/seed — Seed default missions
 * Seeds the hardcoded missions from the App into Firestore.
 * Safe to call multiple times (uses merge with doc ID = mission.id).
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireOrgMember } from "@/lib/require-auth"

const DEFAULT_MISSIONS = [
  {
    id: "m-welcome",
    title: "Bienvenida cafetera",
    titleEn: "Coffee welcome",
    description: "Completa un quiz de bienvenida para conocer el programa",
    descriptionEn: "Complete a welcome quiz to learn about the program",
    emoji: "👋",
    category: "onboarding",
    reward: 200,
    badgeId: "curious-mind",
    criteria: [{ type: "quiz_complete", target: 1 }],
    priority: 1,
    enabled: true,
  },
  {
    id: "m-first-purchase",
    title: "Tu primer café",
    titleEn: "Your first coffee",
    description: "Haz tu primera compra — en barra o por la app",
    descriptionEn: "Make your first purchase — at the bar or through the app",
    emoji: "☕",
    category: "onboarding",
    reward: 200,
    badgeId: "first-sip",
    criteria: [{ type: "first_purchase", target: 1 }],
    priority: 2,
    enabled: true,
  },
  {
    id: "m-complete-profile",
    title: "Tu perfil cafetero",
    titleEn: "Your coffee profile",
    description: "Completa los quizzes de bienvenida para personalizar tu experiencia",
    descriptionEn: "Complete welcome quizzes to personalize your experience",
    emoji: "🎯",
    category: "onboarding",
    reward: 400,
    badgeId: "coffee-scholar",
    criteria: [{ type: "quiz_complete", target: 2 }],
    requiresMissionId: "m-welcome",
    priority: 3,
    enabled: true,
  },
  {
    id: "m-weekly-quiz",
    title: "Reto de la semana",
    titleEn: "Weekly challenge",
    description: "Completa el quiz semanal para ganar granos extra",
    descriptionEn: "Complete the weekly quiz to earn extra beans",
    emoji: "🧠",
    category: "weekly",
    reward: 100,
    criteria: [{ type: "quiz_complete", target: 1 }],
    expiresInDays: 7,
    priority: 10,
    enabled: true,
  },
  {
    id: "m-weekly-visit",
    title: "Visita semanal",
    titleEn: "Weekly visit",
    description: "Haz al menos una compra esta semana",
    descriptionEn: "Make at least one purchase this week",
    emoji: "📅",
    category: "weekly",
    reward: 100,
    criteria: [{ type: "purchase_count", target: 1 }],
    expiresInDays: 7,
    priority: 11,
    enabled: true,
  },
  {
    id: "m-try-3",
    title: "Prueba algo nuevo",
    titleEn: "Try something new",
    description: "Pide 3 productos diferentes que no hayas probado antes",
    descriptionEn: "Order 3 different products you haven't tried before",
    emoji: "🗺️",
    category: "discovery",
    reward: 400,
    badgeId: "flavor-explorer",
    criteria: [{ type: "unique_products", target: 5 }],
    priority: 20,
    enabled: true,
  },
  {
    id: "m-streak-4",
    title: "Racha cafetera",
    titleEn: "Coffee streak",
    description: "Visítanos al menos una vez por semana durante 4 semanas seguidas",
    descriptionEn: "Visit us at least once a week for 4 consecutive weeks",
    emoji: "🔥",
    category: "recurrence",
    reward: 600,
    badgeId: "weekly-ritual",
    criteria: [{ type: "streak_days", target: 4 }],
    priority: 30,
    enabled: true,
  },
  {
    id: "m-order-ahead",
    title: "Pide desde la app",
    titleEn: "Order from the app",
    description: "Haz un pedido por la app y recógelo sin esperar",
    descriptionEn: "Place an app order and pick it up without waiting",
    emoji: "⚡",
    category: "operational",
    reward: 200,
    criteria: [{ type: "order_ahead", target: 1 }],
    priority: 15,
    enabled: true,
  },
]

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params
    await requireOrgMember(_req, orgId)

    const batch = adminDb.batch()
    const now = new Date().toISOString()

    for (const mission of DEFAULT_MISSIONS) {
      const ref = adminDb.doc(`orgs/${orgId}/missions/${mission.id}`)
      batch.set(ref, { ...mission, createdAt: now, updatedAt: now }, { merge: true })
    }

    await batch.commit()
    return NextResponse.json({ seeded: DEFAULT_MISSIONS.length })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    )
  }
}
