/**
 * API: PATCH/DELETE reports/{reportId}
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; reportId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, reportId } = await params
    await requireOrgMember(req, orgId)

    const body = await req.json()
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes

    await adminDb.doc(`reports/${reportId}`).update(updates)

    return NextResponse.json({ ok: true, id: reportId })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ orgId: string; reportId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId, reportId } = await params
    await requireOrgMember(req, orgId)

    await adminDb.doc(`reports/${reportId}`).delete()

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
