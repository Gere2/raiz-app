/**
 * API: GET orgs/{orgId}/events
 * Timeline de eventos del ecosistema
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const type = url.searchParams.get("type")

    let q = adminDb
      .collection(`orgs/${orgId}/events`)
      .orderBy("timestamp", "desc")
      .limit(limit)

    if (type) {
      q = q.where("type", "==", type)
    }

    const snap = await q.get()
    const events = snap.docs.map(d => {
      const data = d.data()
      // Normalize Firestore Timestamp to ISO string for client
      let timestamp = data.timestamp
      if (timestamp && typeof timestamp.toDate === "function") {
        timestamp = timestamp.toDate().toISOString()
      }
      return {
        id: d.id,
        ...data,
        timestamp,
      }
    })

    return NextResponse.json({ events })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
