/**
 * API: GET /api/org/{orgId}/reports — List all reports
 * Reads from top-level "reports" collection
 */

import { NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    const snap = await adminDb.collection("reports").orderBy("createdAt", "desc").limit(200).get()
    const reports = snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
      }
    })

    return NextResponse.json({ reports })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
