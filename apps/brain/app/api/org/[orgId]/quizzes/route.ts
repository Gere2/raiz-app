/**
 * GET /api/org/:orgId/quizzes  — List all quizzes
 * POST /api/org/:orgId/quizzes — Create a new quiz
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { requireOrgMember } from "@/lib/require-auth"
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
      .collection(COLLECTIONS.ORGS).doc(orgId).collection("quizzes")
      .orderBy("sortOrder", "asc")
      .get()

    const quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ quizzes })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  await requireOrgMember(req, orgId)

  await validateRequestSize(req)

  const body = await req.json()

  if (!body.title || !body.moduleId) {
    return NextResponse.json({ error: "title and moduleId required" }, { status: 400 })
  }
  if (body.questions && !Array.isArray(body.questions)) {
    return NextResponse.json({ error: "questions must be an array" }, { status: 400 })
  }
  if (body.points !== undefined && (typeof body.points !== "number" || body.points < 0)) {
    return NextResponse.json({ error: "points must be a non-negative number" }, { status: 400 })
  }

  const ref = adminDb.collection(COLLECTIONS.ORGS).doc(orgId).collection("quizzes").doc()
  const quiz = {
    title: body.title,
    titleEn: body.titleEn || body.title,
    description: body.description || "",
    descriptionEn: body.descriptionEn || "",
    emoji: body.emoji || "🧠",
    points: body.points ?? 100,
    questions: body.questions || [],
    moduleId: body.moduleId,
    cadence: body.cadence || "once",
    enabled: body.enabled !== false,
    sortOrder: body.sortOrder ?? 100,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  await ref.set(quiz)
  return NextResponse.json({ id: ref.id, ...quiz }, { status: 201 })
}
