/**
 * API: POST orgs/{orgId}/rewards/seed
 * Seed initial rewards catalog from hardcoded fallback
 * Safe to call multiple times — uses merge
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

/**
 * Economía calibrada: ~10% tasa de retorno
 * 1€ gastado = 100 puntos | Para premio de X€ → ~X × 1000 puntos
 */
const SEED_REWARDS = [
  { id: "free-upgrade", name: "Upgrade de bebida", nameEn: "Drink upgrade", description: "Leche especial o extra shot gratis en tu bebida", descriptionEn: "Special milk or free extra shot in your drink", pointsCost: 800, emoji: "✨", category: "drinks", enabled: true, sortOrder: 1 },
  { id: "free-snack", name: "Snack pequeño", nameEn: "Small snack", description: "Una galleta o mini bollería de nuestra vitrina", descriptionEn: "A cookie or mini pastry from our display", pointsCost: 2000, emoji: "🍪", category: "food", enabled: true, sortOrder: 2 },
  { id: "free-drink", name: "Bebida gratis", nameEn: "Free drink", description: "Cualquier bebida de la carta: café, matcha, chai... leche vegetal incluida", descriptionEn: "Any drink from the menu: coffee, matcha, chai... plant milk included", pointsCost: 3000, emoji: "☕", category: "drinks", enabled: true, sortOrder: 3 },
  { id: "combo", name: "Combo café + snack", nameEn: "Coffee + snack combo", description: "Una bebida estándar + un snack de la vitrina", descriptionEn: "A standard drink + a snack from the display", pointsCost: 5000, emoji: "🥐", category: "food", enabled: true, sortOrder: 4 },
  { id: "reusable-cup", name: "Vaso reutilizable / taza de marca", nameEn: "Reusable cup / branded mug", description: "Tu propio vaso reutilizable con el logo de Raíz y Grano", descriptionEn: "Your own reusable cup with the Raíz y Grano logo", pointsCost: 8000, emoji: "🥤", category: "merch", enabled: true, sortOrder: 5 },
  { id: "masterclass", name: "Cata / experiencia en campus", nameEn: "Tasting / campus experience", description: "Una sesión de cata breve sobre café de especialidad (plazas limitadas)", descriptionEn: "A short tasting session on specialty coffee (limited spots)", pointsCost: 15000, emoji: "🎓", category: "experience", enabled: true, sortOrder: 6 },
  { id: "coffee-sampler", name: "Pack 'Sampler' para casa", nameEn: "Home sampler pack", description: "Selección de 3 orígenes para probar en casa (50g cada uno)", descriptionEn: "Selection of 3 origins to try at home (50g each)", pointsCost: 12000, emoji: "🎁", category: "merch", enabled: true, sortOrder: 7 },
  { id: "coffee-bag", name: "Bolsa de café 250g (Amor Perfecto)", nameEn: "250g coffee bag (Amor Perfecto)", description: "Una bolsa de 250g de café Amor Perfecto, selección del momento", descriptionEn: "A 250g bag of Amor Perfecto coffee, current selection", pointsCost: 10000, emoji: "📦", category: "merch", enabled: true, sortOrder: 8 },
]

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { uid } = await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const batch = adminDb.batch()
    for (const reward of SEED_REWARDS) {
      const ref = adminDb.doc(`orgs/${orgId}/rewards_catalog/${reward.id}`)
      batch.set(ref, { ...reward, createdBy: uid, createdAt: new Date(), updatedAt: new Date() }, { merge: true })
    }

    await batch.commit()

    return NextResponse.json({ ok: true, count: SEED_REWARDS.length })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
