/**
 * GET /api/org/:orgId/missions  — List all missions
 * POST /api/org/:orgId/missions — Create a new mission
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"
import { COLLECTIONS } from "@/lib/firebase-collections"
import { validateRequestSize } from "@/lib/request-validators"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params
    await requireOrgMember(req, orgId)
    const snap = await adminDb
      .collection(COLLECTIONS.ORGS).doc(orgId).collection("missions")
      .orderBy("priority", "asc")
      .get()

    const missions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ missions })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    await validateRequestSize(req)

    const body = await req.json()

    if (!body.title || !body.category) {
      return NextResponse.json({ error: "title and category required" }, { status: 400 })
    }

    const ref = adminDb.collection(COLLECTIONS.ORGS).doc(orgId).collection("missions").doc()
    const mission = {
      title: body.title,
      titleEn: body.titleEn || body.title,
      description: body.description || "",
      descriptionEn: body.descriptionEn || "",
      emoji: body.emoji || "🎯",
      category: body.category,
      reward: body.reward ?? 100,
      badgeId: body.badgeId || null,
      criteria: body.criteria || [],
      expiresInDays: body.expiresInDays || null,
      priority: body.priority ?? 50,
      requiresMissionId: body.requiresMissionId || null,
      enabled: body.enabled !== false,
      academicPeriod: body.academicPeriod || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await ref.set(mission)
    return NextResponse.json({ id: ref.id, ...mission }, { status: 201 })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
