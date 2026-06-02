/**
 * GET /api/org/:orgId/badges
 *
 * Returns all badge definitions with unlock stats aggregated
 * from customer_profiles.unlockedBadges.
 *
 * Auth: staff only
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"
import { db as adminDb } from "@/lib/firebase-admin"

const BADGE_DEFINITIONS = [
  { id: "first-sip",       name: "Primer sorbo",         nameEn: "First sip",          emoji: "☕", category: "exploration",   rarity: "common",   bonusReward: 100,  unlockCriteria: "1 compra realizada" },
  { id: "flavor-explorer", name: "Explorador de sabores", nameEn: "Flavor explorer",    emoji: "🗺️", category: "exploration",   rarity: "rare",     bonusReward: 300,  unlockCriteria: "5 productos distintos" },
  { id: "menu-master",     name: "Maestro de carta",      nameEn: "Menu master",        emoji: "📖", category: "exploration",   rarity: "epic",     bonusReward: 600,  unlockCriteria: "10 productos distintos" },
  { id: "weekly-ritual",   name: "Ritual semanal",        nameEn: "Weekly ritual",      emoji: "🔄", category: "recurrence",    rarity: "rare",     bonusReward: 400,  unlockCriteria: "4 semanas consecutivas" },
  { id: "loyal-regular",   name: "De la casa",            nameEn: "Regular",            emoji: "🏠", category: "recurrence",    rarity: "epic",     bonusReward: 1000, unlockCriteria: "25 compras totales" },
  { id: "curious-mind",    name: "Mente curiosa",         nameEn: "Curious mind",       emoji: "🧠", category: "knowledge",     rarity: "common",   bonusReward: 100,  unlockCriteria: "1 quiz completado" },
  { id: "coffee-scholar",  name: "Cafetólogo",            nameEn: "Coffee scholar",     emoji: "🎓", category: "knowledge",     rarity: "rare",     bonusReward: 400,  unlockCriteria: "2 quizzes bienvenida" },
  { id: "coffee-expert",   name: "Experto cafetero",      nameEn: "Coffee expert",      emoji: "🏆", category: "knowledge",     rarity: "epic",     bonusReward: 800,  unlockCriteria: "8 quizzes completados" },
  { id: "green-choice",    name: "Elección verde",        nameEn: "Green choice",       emoji: "♻️", category: "sustainability", rarity: "rare",     bonusReward: 300,  unlockCriteria: "1 vaso reutilizable" },
  { id: "first-redeem",    name: "Primer canje",          nameEn: "First redeem",       emoji: "🎁", category: "community",     rarity: "common",   bonusReward: 100,  unlockCriteria: "1 recompensa canjeada" },
  { id: "order-ahead-pro", name: "Pedido listo",          nameEn: "Order ahead pro",    emoji: "⚡", category: "speed",         rarity: "rare",     bonusReward: 300,  unlockCriteria: "3 pedidos por app" },
]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { orgId } = await params

  try { await requireOrgMember(req, orgId) } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Aggregate unlock counts from customer_profiles scoped to this org
  const profilesSnap = await adminDb
    .collection("customer_profiles")
    .where("orgId", "==", orgId)
    .select("unlockedBadges")
    .get()

  const unlockCounts: Record<string, number> = {}
  for (const def of BADGE_DEFINITIONS) {
    unlockCounts[def.id] = 0
  }

  let totalProfiles = 0
  for (const doc of profilesSnap.docs) {
    totalProfiles++
    const badges: string[] = doc.data().unlockedBadges || []
    for (const badgeId of badges) {
      if (unlockCounts[badgeId] !== undefined) {
        unlockCounts[badgeId]++
      }
    }
  }

  const badges = BADGE_DEFINITIONS.map(def => ({
    ...def,
    unlockCount: unlockCounts[def.id] ?? 0,
    unlockRate: totalProfiles > 0
      ? Math.round((unlockCounts[def.id] / totalProfiles) * 100)
      : 0,
  }))

  return NextResponse.json({ badges, totalProfiles })
}
