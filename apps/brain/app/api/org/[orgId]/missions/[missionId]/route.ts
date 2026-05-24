/**
 * PATCH /api/org/:orgId/missions/:missionId — Update mission
 * DELETE /api/org/:orgId/missions/:missionId — Delete mission
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireOrgMember } from "@/lib/require-auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; missionId: string }> },
) {
  try {
    const { orgId, missionId } = await params
    await requireOrgMember(req, orgId)
    const body = await req.json()

    const ref = adminDb.doc(`orgs/${orgId}/missions/${missionId}`)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    // MEDIA #6: Whitelist allowed fields
    const allowed = ['title', 'titleEn', 'description', 'descriptionEn', 'emoji', 'priority', 'sortOrder', 'enabled', 'reward', 'criteria', 'type'];
    const filteredBody = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowed.includes(key))
    );

    const updates = { ...filteredBody, updatedAt: new Date().toISOString() }
    await ref.update(updates)
    return NextResponse.json({ id: missionId, ...snap.data(), ...updates })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; missionId: string }> },
) {
  try {
    const { orgId, missionId } = await params
    await requireOrgMember(_req, orgId)
    await adminDb.doc(`orgs/${orgId}/missions/${missionId}`).delete()
    return NextResponse.json({ deleted: true })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
