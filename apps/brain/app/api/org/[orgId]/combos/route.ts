/**
 * API: GET/POST meeting_combos (teacher meeting combos)
 * Uses top-level "meeting_combos" collection (shared across apps)
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

const COLLECTION = "meeting_combos"

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { uid } = await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const snap = await adminDb.collection(COLLECTION).orderBy("order").get()
    const combos = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ combos })
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

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const data = {
      name: body.name,
      name_en: body.name_en || body.name,
      description: body.description || "",
      description_en: body.description_en || body.description || "",
      basePrice: Number(body.basePrice) || 0,
      servesUpTo: Number(body.servesUpTo) || 2,
      slots: body.slots || [],
      available: body.available !== false,
      popular: body.popular === true,
      order: Number(body.order) || 0,
      createdBy: uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const ref = await adminDb.collection(COLLECTION).add(data)
    return NextResponse.json({ id: ref.id, ...data })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
