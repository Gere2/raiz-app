/**
 * API: GET orgs/{orgId}/events  — timeline de eventos del ecosistema
 *      POST orgs/{orgId}/events — registra un evento de activación del hub
 *
 * El POST solo acepta la allowlist ACTIVATION_EVENTS (lib/event-types) y
 * sanea metadata a { surface, step, state }: nunca importes, productos,
 * extractos ni nombres de clientes. Sin analytics externo: el evento queda
 * org-scoped en Firestore con el mismo shape que el resto del timeline.
 */

import { NextResponse } from "next/server"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"
import { isActivationEvent } from "@/lib/event-types"

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

const ALLOWED_SURFACES = new Set(["hub", "demo", "onboarding", "summary", "margins"])
const ALLOWED_STATES = new Set(["completado", "recomendado", "pendiente"])

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params
    const user = await requireOrgMember(req, orgId)

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const type = String(body?.type || "")
    if (!isActivationEvent(type)) {
      return NextResponse.json({ error: "Evento no permitido" }, { status: 400 })
    }

    // metadata saneada por allowlist de claves y valores acotados
    const data: Record<string, unknown> = {
      surface: ALLOWED_SURFACES.has(String(body?.surface)) ? String(body?.surface) : "hub",
    }
    const md = (body?.metadata ?? {}) as Record<string, unknown>
    if (typeof md.step === "number" && Number.isFinite(md.step)) {
      data.step = Math.max(1, Math.min(10, Math.round(md.step)))
    }
    if (typeof md.state === "string" && ALLOWED_STATES.has(md.state)) {
      data.state = md.state
    }

    const ref = await adminDb.collection(`orgs/${orgId}/events`).add({
      type,
      source: "APP",
      tier: "analytics",
      orgId,
      uid: user.uid,
      data,
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
