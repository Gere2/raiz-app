/**
 * services/event-logger.ts — Servicio compartido para loggear eventos
 *
 * Uso:
 *   import { logEvent } from "@raiz/shared/services/event-logger"
 *   await logEvent(db, "raiz_y_grano", {
 *     type: "pricing.price_changed",
 *     source: "BRAIN",
 *     data: { productId: "xxx", oldPrice: 3.5, newPrice: 3.7 },
 *     actorId: user.uid
 *   })
 */

import { collection, addDoc, serverTimestamp, type Firestore } from "firebase/firestore"
import type { EventType, EventSource, SystemEvent } from "../types/events"

export interface LogEventParams {
  type: EventType
  source: EventSource
  data: Record<string, unknown>
  actorId?: string
  actorName?: string
  critical?: boolean
}

/**
 * Loguea un evento en orgs/{orgId}/events
 * Critical events use exponential backoff retry, others are fire-and-forget
 */
export async function logEvent(
  db: Firestore,
  orgId: string,
  params: LogEventParams
): Promise<string | null> {
  const maxRetries = params.critical ? 3 : 1
  const baseDelay = 100

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ref = collection(db, `orgs/${orgId}/events`)
      const doc = await addDoc(ref, {
        type: params.type,
        source: params.source,
        orgId,
        data: params.data,
        actorId: params.actorId || null,
        actorName: params.actorName || null,
        timestamp: serverTimestamp(),
      })
      return doc.id
    } catch (err) {
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        console.warn(`[EventLogger] Error logging ${params.type} after ${maxRetries} attempt(s):`, err)
        return null
      }
    }
  }
  return null
}

/**
 * Versión para Firebase Admin SDK (server-side en Brain API routes)
 * Critical events use exponential backoff retry, others are fire-and-forget
 */
export async function logEventAdmin(
  adminDb: FirebaseFirestore.Firestore,
  orgId: string,
  params: LogEventParams
): Promise<string | null> {
  const maxRetries = params.critical ? 3 : 1
  const baseDelay = 100

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ref = adminDb.collection(`orgs/${orgId}/events`)
      const doc = await ref.add({
        type: params.type,
        source: params.source,
        orgId,
        data: params.data,
        actorId: params.actorId || null,
        actorName: params.actorName || null,
        timestamp: new Date(),
      })
      return doc.id
    } catch (err) {
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        console.warn(`[EventLogger] Error logging ${params.type} after ${maxRetries} attempt(s):`, err)
        return null
      }
    }
  }
  return null
}
