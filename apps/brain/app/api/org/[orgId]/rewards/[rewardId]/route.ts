/**
 * API: PATCH/DELETE orgs/{orgId}/rewards_catalog/{rewardId}
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; rewardId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, rewardId } = await params
    await requireOrgMember(req, orgId)

    const body = await req.json()
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updates.name = body.name
    if (body.nameEn !== undefined) updates.nameEn = body.nameEn
    if (body.description !== undefined) updates.description = body.description
    if (body.descriptionEn !== undefined) updates.descriptionEn = body.descriptionEn
    if (body.pointsCost !== undefined) updates.pointsCost = Number(body.pointsCost)
    if (body.emoji !== undefined) updates.emoji = body.emoji
    if (body.category !== undefined) updates.category = body.category
    if (body.enabled !== undefined) updates.enabled = body.enabled
    if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)

    await adminDb.doc(`orgs/${orgId}/rewards_catalog/${rewardId}`).update(updates)

    return NextResponse.json({ ok: true, id: rewardId })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ orgId: string; rewardId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, rewardId } = await params
    await requireOrgMember(req, orgId)

    await adminDb.doc(`orgs/${orgId}/rewards_catalog/${rewardId}`).delete()

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
