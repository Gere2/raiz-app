/**
 * API: POST orgs/{orgId}/pricing/update
 * Pricing centralizado: Brain actualiza precio → baja a products (POS/App)
 *
 * Body: { skuId, newPrice }
 * Efecto: Actualiza SKU + Recipe + products/{posProductId}.price atómicamente
 */

import { NextResponse } from "next/server"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { uid } = await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const { skuId, newPrice, idempotencyKey } = await req.json()

    if (!skuId || newPrice === undefined || newPrice <= 0) {
      return NextResponse.json({ error: "skuId and valid newPrice required" }, { status: 400 })
    }

    // Check idempotency: prevent duplicate updates from network retries
    if (idempotencyKey) {
      const idempotencyRef = adminDb.doc(`orgs/${orgId}/idempotency_keys/${idempotencyKey}`)
      const idempotencySnap = await idempotencyRef.get()
      if (idempotencySnap.exists) {
        const stored = idempotencySnap.data() ?? {}
        return NextResponse.json({
          ok: true,
          changes: stored.changes ?? [],
          newMargin: stored.newMargin ?? 0,
          newFoodCostPct: stored.newFoodCostPct ?? 0,
          isDuplicate: true,
        })
      }
    }

    // 1. Leer SKU actual
    const skuRef = adminDb.doc(`orgs/${orgId}/skus/${skuId}`)
    const skuSnap = await skuRef.get()
    if (!skuSnap.exists) {
      return NextResponse.json({ error: "SKU not found" }, { status: 404 })
    }

    const sku = skuSnap.data()!
    const oldPrice = sku.sellingPrice || 0
    const totalCost = sku.totalCost || 0

    // 2. Recalcular márgenes
    const margin = newPrice - totalCost
    const foodCostPct = newPrice >= 0.01 ? (totalCost / newPrice) * 100 : 0

    const batch = adminDb.batch()
    const changes: string[] = []

    // 3. Actualizar SKU
    batch.update(skuRef, {
      sellingPrice: newPrice,
      margin,
      foodCostPct,
      updatedAt: FieldValue.serverTimestamp(),
    })
    changes.push(`SKU ${sku.name}: ${oldPrice}€ → ${newPrice}€`)

    // 4. Actualizar Recipe vinculada
    if (sku.recipeId) {
      const recipeRef = adminDb.doc(`orgs/${orgId}/recipes/${sku.recipeId}`)
      const recipeSnap = await recipeRef.get()
      if (recipeSnap.exists) {
        const recipe = recipeSnap.data()!
        const recipeFc = newPrice >= 0.01 ? ((recipe.totalCost || 0) / newPrice) * 100 : 0
        batch.update(recipeRef, {
          sellingPrice: newPrice,
          foodCostPct: recipeFc,
          updatedAt: FieldValue.serverTimestamp(),
        })
        changes.push(`Recipe ${recipe.name}: foodCost → ${recipeFc.toFixed(1)}%`)
      }
    }

    // 5. CLAVE: Actualizar products/{posProductId}.price (baja a POS y App)
    if (sku.posProductId) {
      const productRef = adminDb.doc(`products/${sku.posProductId}`)
      const productSnap = await productRef.get()
      if (productSnap.exists) {
        batch.update(productRef, {
          price: newPrice,
          updatedAt: FieldValue.serverTimestamp(),
        })
        changes.push(`Product ${sku.posProductId}: price → ${newPrice}€ (visible en POS y App)`)
      }
    }

    // 6. Log evento
    const eventRef = adminDb.collection(`orgs/${orgId}/events`).doc()
    batch.set(eventRef, {
      type: "pricing.price_changed",
      source: "BRAIN",
      orgId,
      data: {
        skuId,
        skuName: sku.name,
        posProductId: sku.posProductId || null,
        oldPrice,
        newPrice,
        oldFoodCostPct: sku.foodCostPct || 0,
        newFoodCostPct: foodCostPct,
        margin,
      },
      actorId: uid,
      timestamp: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    // Store idempotency key for 24 hours (TTL handled externally)
    if (idempotencyKey) {
      await adminDb.doc(`orgs/${orgId}/idempotency_keys/${idempotencyKey}`).set({
        changes,
        newMargin: margin,
        newFoodCostPct: foodCostPct,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({
      ok: true,
      changes,
      newMargin: margin,
      newFoodCostPct: foodCostPct,
    })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message, requestId }, { status: err.status || 500 })
  }
}
