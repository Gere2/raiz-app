/**
 * API: PATCH/DELETE meeting_combos/{comboId}
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

const COLLECTION = "meeting_combos"

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; comboId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, comboId } = await params
    await requireOrgMember(req, orgId)

    const body = await req.json()
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updates.name = body.name
    if (body.name_en !== undefined) updates.name_en = body.name_en
    if (body.description !== undefined) updates.description = body.description
    if (body.description_en !== undefined) updates.description_en = body.description_en
    if (body.basePrice !== undefined) updates.basePrice = Number(body.basePrice)
    if (body.servesUpTo !== undefined) updates.servesUpTo = Number(body.servesUpTo)
    if (body.slots !== undefined) updates.slots = body.slots
    if (body.available !== undefined) updates.available = body.available
    if (body.popular !== undefined) updates.popular = body.popular
    if (body.order !== undefined) updates.order = Number(body.order)

    await adminDb.doc(`${COLLECTION}/${comboId}`).update(updates)

    return NextResponse.json({ ok: true, id: comboId })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ orgId: string; comboId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, comboId } = await params
    await requireOrgMember(req, orgId)

    await adminDb.doc(`${COLLECTION}/${comboId}`).delete()

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
