/**
 * POST /api/stripe/webhook
 *
 * Webhook de Stripe en Brain. Procesa eventos relacionados con el Bono
 * Supervivencia Exámenes; cualquier otro evento se ignora silenciosamente
 * (otros webhooks de la plataforma — ej. apps/app — pueden estar suscritos
 * a los mismos eventos para órdenes de café).
 *
 * Eventos soportados:
 *  - payment_intent.succeeded:
 *      metadata.type === "exam_pass_purchase"   → activateExamPassFromPayment
 *      metadata.type === "exam_pass_redemption" → consumeRedemption
 *  - payment_intent.payment_failed:
 *      "exam_pass_purchase"   → cancelPendingPass
 *      "exam_pass_redemption" → releaseRedemption
 *  - payment_intent.canceled:
 *      idem a payment_failed.
 *
 * Idempotencia: garantizada por la engine. Si Stripe reentrega el evento, las
 * funciones de la engine devuelven `alreadyX: true` sin re-aplicar contadores.
 *
 * Verificación de amount: en `succeeded` comprobamos `paidAmountCents` contra
 * el esperado del pass (purchasePrice) o de la redemption (totalSupplement).
 * Si no coincide, NO se activa/consume y se loguea WARN — el caller debe
 * investigar (cliente trampeó el amount, fallo de Stripe, etc.).
 *
 * Auth: firma Stripe en `Stripe-Signature`. Sin signing → 400.
 *
 * Setup en Stripe dashboard:
 *  1. Configurar nuevo endpoint: https://<brain>/api/stripe/webhook
 *  2. Suscribir eventos: payment_intent.succeeded, payment_intent.payment_failed,
 *     payment_intent.canceled.
 *  3. Copiar el "Signing secret" (whsec_...) a STRIPE_WEBHOOK_SECRET en Vercel.
 */
import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import {
  activateExamPassFromPayment,
  cancelPendingPass,
  consumeRedemption,
  releaseRedemption,
} from "@/lib/exam-pass/engine"
import { roundEuros } from "@/lib/exam-pass/calc"
import { db as adminDb } from "@/lib/firebase-admin"
import type { ExamPassRedemption } from "@/lib/exam-pass/types"

// Tipos de metadata que esta capa entiende.
type ExamPassMetadataType = "exam_pass_purchase" | "exam_pass_redemption"

interface ExamPassPurchaseMeta {
  type: "exam_pass_purchase"
  examPassId: string
  orgId: string
  userId: string
  purchasePrice: string
}
interface ExamPassRedemptionMeta {
  type: "exam_pass_redemption"
  redemptionId: string
  passId: string
  orgId: string
  userId: string
  totalSupplementAmount: string
}

function readMetadataType(meta: Stripe.Metadata | null | undefined): ExamPassMetadataType | null {
  if (!meta) return null
  const t = meta.type
  if (t === "exam_pass_purchase" || t === "exam_pass_redemption") return t
  return null
}

function logEvent(level: "info" | "warn" | "error", op: string, data: Record<string, unknown>) {
  const line = JSON.stringify({ op, level, ts: new Date().toISOString(), ...data })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

// ── Handlers ──────────────────────────────────────────────────────

async function handlePurchaseSucceeded(intent: Stripe.PaymentIntent) {
  const meta = intent.metadata as unknown as ExamPassPurchaseMeta
  const passId = meta.examPassId
  if (!passId) {
    logEvent("error", "exam_pass.webhook.missing_pass_id", { paymentIntentId: intent.id })
    return
  }

  const result = await activateExamPassFromPayment({
    passId,
    paymentIntentId: intent.id,
    paidAmountCents: intent.amount_received,
  })

  if (result.ok) {
    if (result.alreadyActive) {
      logEvent("info", "exam_pass.purchase_already_active", {
        passId,
        paymentIntentId: intent.id,
      })
    } else {
      logEvent("info", "exam_pass.purchase_activated", {
        passId,
        paymentIntentId: intent.id,
        amountCents: intent.amount_received,
        orgId: meta.orgId,
        userId: meta.userId,
      })
    }
    return
  }

  // Errores no idempotentes: loguear y rendirse — Stripe no debe reintentarse,
  // y el dato ya quedó persistido en Stripe. Investigación manual.
  if (result.error === "AMOUNT_MISMATCH") {
    logEvent("warn", "exam_pass.purchase_amount_mismatch", {
      passId,
      paymentIntentId: intent.id,
      paidAmountCents: intent.amount_received,
      expectedPurchasePrice: meta.purchasePrice,
    })
    return
  }
  logEvent("error", "exam_pass.purchase_activate_failed", {
    passId,
    paymentIntentId: intent.id,
    error: result.error,
  })
}

async function handleRedemptionSucceeded(intent: Stripe.PaymentIntent) {
  const meta = intent.metadata as unknown as ExamPassRedemptionMeta
  const redemptionId = meta.redemptionId
  if (!redemptionId) {
    logEvent("error", "exam_pass.webhook.missing_redemption_id", {
      paymentIntentId: intent.id,
    })
    return
  }

  // Verificación de amount antes de consumir: si el pago no cubre el
  // suplemento esperado, NO consumimos crédito. El crédito sigue reserved
  // y un humano puede investigar (typically: nunca debería pasar porque el
  // cliente confirma el PI tal cual lo creamos).
  const redSnap = await adminDb.collection("exam_pass_redemptions").doc(redemptionId).get()
  if (!redSnap.exists) {
    logEvent("error", "exam_pass.redemption_not_found", {
      redemptionId,
      paymentIntentId: intent.id,
    })
    return
  }
  const red = redSnap.data() as ExamPassRedemption
  const expectedCents = Math.round(roundEuros(red.totalSupplement) * 100)
  if (intent.amount_received !== expectedCents) {
    logEvent("warn", "exam_pass.redemption_amount_mismatch", {
      redemptionId,
      paymentIntentId: intent.id,
      paidAmountCents: intent.amount_received,
      expectedCents,
      totalSupplement: red.totalSupplement,
    })
    return
  }

  const result = await consumeRedemption({
    redemptionId,
    paymentIntentId: intent.id,
  })

  if (result.ok) {
    if (result.alreadyConsumed) {
      logEvent("info", "exam_pass.redemption_already_consumed", {
        redemptionId,
        paymentIntentId: intent.id,
      })
    } else {
      logEvent("info", "exam_pass.redemption_consumed", {
        redemptionId,
        paymentIntentId: intent.id,
        passId: red.passId,
        productId: red.productId,
        totalSupplement: red.totalSupplement,
      })
    }
    return
  }
  logEvent("error", "exam_pass.redemption_consume_failed", {
    redemptionId,
    paymentIntentId: intent.id,
    error: result.error,
  })
}

async function handlePurchaseFailed(intent: Stripe.PaymentIntent, why: string) {
  const meta = intent.metadata as unknown as ExamPassPurchaseMeta
  const passId = meta.examPassId
  if (!passId) {
    logEvent("error", "exam_pass.webhook.missing_pass_id", { paymentIntentId: intent.id })
    return
  }
  const result = await cancelPendingPass({
    passId,
    reason: why,
    paymentIntentId: intent.id,
  })
  if (result.ok) {
    if (result.alreadyCanceled) {
      logEvent("info", "exam_pass.purchase_already_canceled", {
        passId,
        paymentIntentId: intent.id,
      })
    } else {
      logEvent("info", "exam_pass.purchase_canceled", {
        passId,
        paymentIntentId: intent.id,
        reason: why,
      })
    }
    return
  }
  // INVALID_STATE típicamente significa que el pass ya está active (race con
  // un succeeded que llegó primero). No es alarmante.
  logEvent("warn", "exam_pass.purchase_cancel_skipped", {
    passId,
    paymentIntentId: intent.id,
    error: result.error,
  })
}

async function handleRedemptionFailed(intent: Stripe.PaymentIntent, why: string) {
  const meta = intent.metadata as unknown as ExamPassRedemptionMeta
  const redemptionId = meta.redemptionId
  if (!redemptionId) {
    logEvent("error", "exam_pass.webhook.missing_redemption_id", {
      paymentIntentId: intent.id,
    })
    return
  }
  const result = await releaseRedemption({
    redemptionId,
    reason: why,
  })
  if (result.ok) {
    if (result.alreadyReleased) {
      logEvent("info", "exam_pass.redemption_already_released", {
        redemptionId,
        paymentIntentId: intent.id,
      })
    } else {
      logEvent("info", "exam_pass.redemption_released", {
        redemptionId,
        paymentIntentId: intent.id,
        reason: why,
      })
    }
    return
  }
  logEvent("warn", "exam_pass.redemption_release_skipped", {
    redemptionId,
    paymentIntentId: intent.id,
    error: result.error,
  })
}

// ── Route handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "Missing Stripe-Signature" }, { status: 400 })

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    logEvent("error", "exam_pass.webhook.missing_secret", {})
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  // Necesitamos el body crudo para verificar la firma.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    logEvent("warn", "exam_pass.webhook.signature_invalid", {
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Solo procesamos eventos con metadata.type del bono. Cualquier otro evento
  // (ej. webhook compartido con otra parte de la plataforma) se ignora con 200.
  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent
      const t = readMetadataType(intent.metadata)
      if (t === "exam_pass_purchase") await handlePurchaseSucceeded(intent)
      else if (t === "exam_pass_redemption") await handleRedemptionSucceeded(intent)
      // Else: ignore.
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent
      const t = readMetadataType(intent.metadata)
      const reason = intent.last_payment_error?.message ?? "payment_failed"
      if (t === "exam_pass_purchase") await handlePurchaseFailed(intent, reason)
      else if (t === "exam_pass_redemption") await handleRedemptionFailed(intent, reason)
    } else if (event.type === "payment_intent.canceled") {
      const intent = event.data.object as Stripe.PaymentIntent
      const t = readMetadataType(intent.metadata)
      const reason = intent.cancellation_reason ?? "canceled"
      if (t === "exam_pass_purchase") await handlePurchaseFailed(intent, reason)
      else if (t === "exam_pass_redemption") await handleRedemptionFailed(intent, reason)
    }
    // Cualquier otro tipo de evento: 200 sin más.
  } catch (err) {
    // Si una transacción Firestore falla, devolvemos 500 para que Stripe
    // reintente. Las transiciones son idempotentes, así que reintentar es
    // seguro.
    logEvent("error", "exam_pass.webhook.handler_error", {
      eventType: event.type,
      eventId: event.id,
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
