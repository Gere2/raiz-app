/**
 * POST /api/org/:orgId/exam-pass/purchase-init
 *
 * Inicia la compra de un Bono Supervivencia Exámenes.
 *
 * Anti-pending guard:
 *  1. Si el usuario ya tiene un pass `active`: 409 ACTIVE_PASS_EXISTS con el
 *     pass como detail. (Caso "ya tiene bono operativo".)
 *  2. Si tiene un pass `pending` con un PaymentIntent reusable: devuelve el
 *     mismo passId + clientSecret (no crea otro PI ni otro pass).
 *  3. Si tiene un pass `pending` con PI en estado terminal (canceled, failed):
 *     reasocia un PI nuevo al pass existente.
 *  4. Si no tiene nada: crea un pass nuevo + PI nuevo.
 *
 * Razón: queremos que doble-clic / refresh / volver-de-back no genere
 * documentos huérfanos en Firestore ni cobros duplicados.
 *
 * El webhook (Fase 3C) es quien acaba activando el pass al confirmar el pago.
 *
 * Auth: Bearer token. userId siempre = caller.uid.
 */
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { requireAuth } from "@/lib/require-auth"
import {
  attachPaymentIntentToPass,
  getActiveExamPassForUser,
  getPendingExamPassForUser,
  initExamPassPurchase,
} from "@/lib/exam-pass/engine"
import { errorResponse } from "@/lib/exam-pass/http-errors"
import { getStripe } from "@/lib/stripe"
import type { ExamPass } from "@/lib/exam-pass/types"

/**
 * Estados de PI que aceptamos para reusar el mismo intent. Si el PI está en
 * uno de estos, el cliente puede confirmarlo: no tocamos nada y devolvemos
 * el mismo clientSecret.
 */
const REUSABLE_PI_STATUSES: Stripe.PaymentIntent.Status[] = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
]

interface PIInfo {
  clientSecret: string
  paymentIntentId: string
  reused: boolean
}

/**
 * Para un pass `pending`, asegura que existe un PI cobrable y devuelve su
 * clientSecret. Reusa el PI si sigue válido; si no, crea uno nuevo y lo
 * asocia al pass.
 */
async function ensurePIForPass(pass: ExamPass): Promise<PIInfo> {
  const stripe = getStripe()

  // Caso A: el pass ya tiene PI asociado. Intentar reusarlo.
  if (pass.paymentIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(pass.paymentIntentId)
      if (REUSABLE_PI_STATUSES.includes(existing.status) && existing.client_secret) {
        return {
          clientSecret: existing.client_secret,
          paymentIntentId: existing.id,
          reused: true,
        }
      }
      // Estado terminal (canceled/succeeded/etc.): caer al "create new" abajo.
      console.log(
        JSON.stringify({
          op: "exam_pass.purchase_init.pi_unreusable",
          passId: pass.id,
          oldPaymentIntentId: existing.id,
          oldStatus: existing.status,
        }),
      )
    } catch (err) {
      // PI no existe o Stripe se queja: lo recreamos.
      console.warn(
        "[exam-pass/purchase-init] retrieve PI falló, creando nuevo:",
        pass.paymentIntentId,
        err,
      )
    }
  }

  // Caso B: crear PI nuevo y asociarlo. Idempotency-key fijo por passId,
  // pero como hemos cambiado el "intent" lógico, le añadimos epoch para que
  // Stripe nos dé un PI nuevo en lugar de devolver el viejo.
  const intent = await stripe.paymentIntents.create(
    {
      amount: pass.purchasePrice * 100,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "exam_pass_purchase",
        examPassId: pass.id,
        orgId: pass.orgId,
        userId: pass.userId,
        purchasePrice: String(pass.purchasePrice),
      },
      description: `Bono Supervivencia Exámenes (${pass.purchasePrice} €)`,
    },
    { idempotencyKey: `exam_pass_purchase:${pass.id}:${Date.now()}` },
  )
  if (!intent.client_secret) {
    throw new Error("PaymentIntent sin client_secret")
  }
  await attachPaymentIntentToPass(pass.id, intent.id)
  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    reused: false,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try {
    caller = await requireAuth(req)
  } catch {
    return errorResponse("UNAUTHORIZED")
  }

  const { orgId } = await params
  if (!orgId) return errorResponse("INVALID_INPUT", { message: "orgId requerido" })

  // 1. ¿Ya tiene activo? Bloquear.
  const active = await getActiveExamPassForUser(caller.uid, orgId)
  if (active) {
    return errorResponse("ACTIVE_PASS_EXISTS", {
      message: "Ya tienes un bono activo",
      details: {
        passId: active.id,
        creditsRemaining: active.creditsTotal - active.creditsUsed - active.creditsReserved,
        expiresAt: active.expiresAt,
      },
    })
  }

  // 2. ¿Ya tiene un pending? Reusar.
  const pending = await getPendingExamPassForUser(caller.uid, orgId)
  if (pending) {
    try {
      const pi = await ensurePIForPass(pending)
      console.log(
        JSON.stringify({
          op: "exam_pass.purchase_init.reuse_pending",
          passId: pending.id,
          paymentIntentId: pi.paymentIntentId,
          piReused: pi.reused,
          userId: caller.uid,
          orgId,
        }),
      )
      return NextResponse.json({
        passId: pending.id,
        clientSecret: pi.clientSecret,
        paymentIntentId: pi.paymentIntentId,
        price: pending.purchasePrice,
        priceCents: pending.purchasePrice * 100,
        currency: "EUR",
        reusedPending: true,
      })
    } catch (err) {
      console.error("[exam-pass/purchase-init] ensurePIForPass falló:", err)
      return errorResponse("STRIPE_ERROR")
    }
  }

  // 3. Crear pass nuevo + PI.
  const init = await initExamPassPurchase({ orgId, userId: caller.uid })
  if (!init.ok) return errorResponse("INVALID_INPUT", { message: init.error })
  const { pass, quote } = init

  let pi: PIInfo
  try {
    pi = await ensurePIForPass(pass)
  } catch (err) {
    console.error("[exam-pass/purchase-init] Stripe error en pass nuevo:", err)
    return errorResponse("STRIPE_ERROR")
  }

  console.log(
    JSON.stringify({
      op: "exam_pass.purchase_init.created",
      passId: pass.id,
      paymentIntentId: pi.paymentIntentId,
      price: pass.purchasePrice,
      userId: caller.uid,
      orgId,
    }),
  )

  return NextResponse.json({
    passId: pass.id,
    clientSecret: pi.clientSecret,
    paymentIntentId: pi.paymentIntentId,
    price: quote.price,
    priceCents: quote.priceCents,
    currency: quote.currency,
    soldCount: quote.soldCount,
    earlyBirdRemaining: quote.earlyBirdRemaining,
    reusedPending: false,
  })
}
