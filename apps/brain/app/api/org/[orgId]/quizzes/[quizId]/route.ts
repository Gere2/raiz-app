/**
 * PATCH /api/org/:orgId/quizzes/:quizId — Update quiz
 * DELETE /api/org/:orgId/quizzes/:quizId — Delete quiz
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireOrgMember } from "@/lib/require-auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; quizId: string }> },
) {
  try {
    const { orgId, quizId } = await params
    await requireOrgMember(req, orgId)
    const body = await req.json()

    const ref = adminDb.doc(`orgs/${orgId}/quizzes/${quizId}`)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    // MEDIA #5: Whitelist allowed fields
    const allowed = ['title', 'titleEn', 'description', 'descriptionEn', 'emoji', 'points', 'sortOrder', 'enabled', 'options', 'correctIndex', 'category'];
    const filteredBody = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowed.includes(key))
    );

    const updates = { ...filteredBody, updatedAt: new Date().toISOString() }
    await ref.update(updates)
    return NextResponse.json({ id: quizId, ...snap.data(), ...updates })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; quizId: string }> },
) {
  try {
    const { orgId, quizId } = await params
    await requireOrgMember(req, orgId)
    await adminDb.doc(`orgs/${orgId}/quizzes/${quizId}`).delete()
    return NextResponse.json({ deleted: true })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
