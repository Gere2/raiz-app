/**
 * TODO: Consider integrating Sentry for error monitoring:
 * - Wrap error handlers to capture exceptions
 * - Track unhandled rejections
 * - Monitor webhook signature verification failures
 * - Set up alerts for payment processing errors
 * See: https://sentry.io/
 */

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

// ── Stripe ──────────────────────────────────────────────────────
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  console.error("[Webhook] STRIPE_SECRET_KEY no está configurada.")
}

function getStripe(): Stripe | null {
  if (!stripeSecretKey) return null
  return new Stripe(stripeSecretKey, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion })
}

// ── Firebase Admin ───────────────────────────────────────────────
// Soporta dos métodos de autenticación:
// 1. FIREBASE_SERVICE_ACCOUNT_JSON — JSON completo de la cuenta de servicio (recomendado en Vercel)
// 2. Solo projectId — usa Application Default Credentials (funciona en Google Cloud)
function initFirebaseAdmin() {
  if (getApps().length > 0) return

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) {
    console.warn("[Webhook] NEXT_PUBLIC_FIREBASE_PROJECT_ID no configurado. Firebase Admin deshabilitado.")
    return
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (serviceAccountJson) {
      // Usar service account explícito (recomendado en Vercel/producción)
      try {
        const serviceAccount = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(serviceAccount) })
        console.log("[Webhook] Firebase Admin inicializado con service account.")
      } catch (parseErr) {
        console.error("[Webhook] Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:", parseErr)
        // Fallback to projectId only
        initializeApp({ projectId })
        console.log("[Webhook] Firebase Admin inicializado con ADC (projectId only) después de error de parsing.")
      }
    } else {
      // Fallback: Application Default Credentials (funciona en GCP, Cloud Run, etc.)
      initializeApp({ projectId })
      console.log("[Webhook] Firebase Admin inicializado con ADC (projectId only).")
    }
  } catch (err) {
    console.error("[Webhook] Error inicializando Firebase Admin:", err)
  }
}

initFirebaseAdmin()

// ───────────────────────────────────────────────────────────────
// Helper: actualizar estado del pedido en Firestore
// ───────────────────────────────────────────────────────────────
async function updateOrderPayment(
  orderId: string,
  paymentIntentId: string,
  status: "PAID" | "FAILED",
  extra: Record<string, unknown> = {}
) {
  if (getApps().length === 0) {
    console.warn("[Webhook] Firebase Admin no disponible — no se puede actualizar la orden.")
    return
  }

  const db = getFirestore()
  const ref = db.collection("orders").doc(orderId)

  const snap = await ref.get()
  if (!snap.exists) {
    console.warn(`[Webhook] Orden ${orderId} no encontrada en Firestore.`)
    return
  }

  // Use serverTimestamp for consistency with app-side timestamps (UTC)
  await ref.update({
    paymentStatus: status,
    stripePaymentIntentId: paymentIntentId,
    [`paymentHistory.${paymentIntentId}`]: {
      status,
      timestamp: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  })

  console.log(`[Webhook] Orden ${orderId} actualizada → paymentStatus: ${status}`)
}

// ───────────────────────────────────────────────────────────────
// POST /api/webhook
// ───────────────────────────────────────────────────────────────

/**
 * Stripe Webhook endpoint.
 *
 * Configuración en Stripe Dashboard:
 * 1. https://dashboard.stripe.com/webhooks → "Add endpoint"
 * 2. URL: https://app.raizygrano.com/api/webhook
 * 3. Eventos: payment_intent.succeeded, payment_intent.payment_failed,
 *             charge.refunded
 * 4. Copiar el "Signing secret" → env var STRIPE_WEBHOOK_SECRET
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe no configurado en el servidor." },
      { status: 503 }
    )
  }

  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[Webhook] STRIPE_WEBHOOK_SECRET no configurada.")
    return NextResponse.json(
      { error: "Webhook secret no configurado. Define STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    )
  }

  if (!sig) {
    return NextResponse.json({ error: "Falta stripe-signature header." }, { status: 400 })
  }

  // Validar que el body sea JSON válido
  if (!body || typeof body !== "string" || body.trim() === "") {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud está vacío o no es válido." },
      { status: 400 }
    )
  }

  // Verificar firma
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Error desconocido"
    console.error("[Webhook] Verificación de firma fallida:", errorMessage)
    return NextResponse.json(
      { error: "Webhook signature inválida." },
      { status: 400 }
    )
  }

  // Manejar eventos
  try {
    switch (event.type) {
      // ── Pago exitoso ─────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent
        const { orderId } = pi.metadata || {}

        console.log(
          `✅ [Webhook] Pago completado: ${pi.id}`,
          `Importe: ${(pi.amount / 100).toFixed(2)} €`,
          `Orden: ${orderId || "N/A"}`
        )

        // SECURITY: Validate amount_received matches payment intent amount
        if (pi.amount_received && pi.amount_received !== pi.amount) {
          console.warn(
            `[Webhook] Amount mismatch for PaymentIntent ${pi.id}: ` +
            `expected ${pi.amount} cents, received ${pi.amount_received} cents. ` +
            `Order: ${orderId || "N/A"}`
          )
        }

        if (orderId && getApps().length > 0) {
          // SECURITY: Idempotency check — verify order is not already marked PAID
          const db = getFirestore()
          const orderSnap = await db.collection("orders").doc(orderId).get()

          if (orderSnap.exists && orderSnap.data()?.paymentStatus === "PAID") {
            console.warn(`[Webhook] Payment already recorded for order ${orderId} with paymentIntentId ${pi.id}. Skipping duplicate update.`)
          } else {
            await updateOrderPayment(orderId, pi.id, "PAID", { paidAt: FieldValue.serverTimestamp() })
          }
        }
        break
      }

      // ── Pago fallido ─────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent
        const { orderId } = pi.metadata || {}
        const reason = pi.last_payment_error?.message || "desconocido"

        console.log(
          `❌ [Webhook] Pago fallido: ${pi.id}`,
          `Razón: ${reason}`,
          `Orden: ${orderId || "N/A"}`
        )

        if (orderId) {
          await updateOrderPayment(orderId, pi.id, "FAILED", {
            paymentFailureReason: reason,
            // Marcar la orden como cancelada si el pago falla definitivamente
            status: "CANCELED",
          })
        }
        break
      }

      // ── Reembolso ────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge
        const piId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id

        console.log(
          `↩️ [Webhook] Reembolso procesado: charge ${charge.id}`,
          `PaymentIntent: ${piId || "N/A"}`,
          `Importe reembolsado: ${(charge.amount_refunded / 100).toFixed(2)} €`
        )

        // Actualizar la orden buscando por paymentIntentId
        if (piId && getApps().length > 0) {
          try {
            const db = getFirestore()
            // NOTE: For better performance with high order volumes, consider creating a
            // composite index on: collection(orders) → [paymentIntentId ASC, createdAt DESC]
            // This will optimize queries that filter by paymentIntentId and sort by recency.
            const snap = await db
              .collection("orders")
              .where("paymentIntentId", "==", piId)
              .limit(1)
              .get()

            if (!snap.empty) {
              const docRef = snap.docs[0]?.ref
              if (docRef) {
                await docRef.update({
                  paymentStatus: "REFUNDED",
                  refundedAt: FieldValue.serverTimestamp(),
                  refundedAmount: charge.amount_refunded / 100,
                  updatedAt: FieldValue.serverTimestamp(),
                })
                console.log(`[Webhook] Orden marcada como REFUNDED.`)
              } else {
                console.warn(`[Webhook] Refund processed but no valid document reference found for paymentIntentId ${piId}.`)
              }
            } else {
              console.warn(`[Webhook] Refund processed but no matching order found for paymentIntentId ${piId}.`)
            }
          } catch (err) {
            console.error("[Webhook] Error actualizando reembolso:", err)
          }
        }
        break
      }

      default:
        console.log(`[Webhook] Evento no manejado: ${event.type}`)
    }
  } catch (err) {
    console.error("[Webhook] Error procesando evento:", err)
    // Devolver 500 para que Stripe sepa que ocurrió un error en nuestro lado
    // Log the actual error but return generic message to prevent information disclosure
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true })
}
