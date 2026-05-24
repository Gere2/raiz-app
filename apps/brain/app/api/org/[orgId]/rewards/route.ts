/**
 * API: GET/POST orgs/{orgId}/rewards_catalog
 * Brain gobierna el catálogo de recompensas
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { uid } = await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const snap = await adminDb.collection(`orgs/${orgId}/rewards_catalog`).orderBy("pointsCost").get()
    const rewards = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ rewards })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { uid } = await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const body = await req.json()
    const { id, name, nameEn, description, descriptionEn, pointsCost, emoji, category, enabled } = body

    if (!name || !pointsCost) {
      return NextResponse.json({ error: "name and pointsCost required" }, { status: 400 })
    }

    const data = {
      name,
      nameEn: nameEn || name,
      description: description || "",
      descriptionEn: descriptionEn || description || "",
      pointsCost: Number(pointsCost),
      emoji: emoji || "🎁",
      category: category || "drinks",
      enabled: enabled !== false,
      sortOrder: Number(pointsCost),
      createdBy: uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Si viene con ID específico, usar setDoc
    if (id) {
      await adminDb.doc(`orgs/${orgId}/rewards_catalog/${id}`).set(data, { merge: true })
      return NextResponse.json({ id, ...data })
    }

    const ref = await adminDb.collection(`orgs/${orgId}/rewards_catalog`).add(data)
    return NextResponse.json({ id: ref.id, ...data })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
