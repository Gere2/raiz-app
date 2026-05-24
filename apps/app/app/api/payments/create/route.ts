import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

// ── Stripe ──────────────────────────────────────────────────────
const stripeSecretKey = process.env.STRIPE_SECRET_KEY

function getStripe(): Stripe | null {
  if (!stripeSecretKey) return null
  return new Stripe(stripeSecretKey, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion })
}

// ── Firebase Admin (mismo patrón que webhook) ────────────────────
function initFirebaseAdmin() {
  if (getApps().length > 0) return
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) return
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(serviceAccount) })
      } catch (err) {
        console.error("[payments/create] Error parsing Firebase service account:", err)
        throw err
      }
    } else {
      initializeApp({ projectId })
    }
  } catch (err) {
    console.error("[payments/create] Error initializing Firebase Admin:", err)
  }
}

initFirebaseAdmin()

// Verify Firebase Auth token
async function verifyAuthToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  try {
    const token = authHeader.substring(7)
    if (getApps().length === 0) {
      console.warn("[payments/create] Firebase Admin not initialized")
      return null
    }

    const auth = getAuth()
    const decodedToken = await auth.verifyIdToken(token)
    return decodedToken.uid
  } catch (err) {
    console.error("[payments/create] Token verification failed:", err)
    return null
  }
}

/**
 * POST /api/payments/create
 *
 * Crea un PaymentIntent de Stripe para un pedido existente o nuevo.
 * Útil para flujos de "reintentar pago" o pago diferido.
 *
 * Body:
 *   orderId       — ID de la orden en Firestore (opcional)
 *   amount        — Importe en céntimos (requerido si no hay orderId)
 *   customerEmail — Email del cliente
 *   customerName  — Nombre del cliente
 *
 * Response:
 *   { clientSecret, paymentIntentId }
 */
export async function POST(request: NextRequest) {
  // Verify authentication token
  const userId = await verifyAuthToken(request)
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized. Valid Firebase auth token required." },
      { status: 401 }
    )
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: "Servicio de pagos no configurado." },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()

    // Validate body schema
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const { orderId, customerEmail, customerName } = body
    let { amount } = body

    // Validate amount if provided
    if (amount !== undefined && amount !== null && typeof amount !== "number") {
      return NextResponse.json(
        { error: "El campo 'amount' debe ser un número" },
        { status: 400 }
      )
    }

    // Ensure amount is in cents: if provided in euros, multiply by 100
    // Example: 12.50 euros → 1250 cents
    if (amount !== undefined && amount !== null) {
      // Assume incoming amount is in euros and convert to cents
      amount = Math.round(amount * 100)

      // SECURITY: Validate amount is in reasonable range (euros, not cents)
      if (amount > 1000000) {
        return NextResponse.json(
          { error: "Amount appears to be in cents, not euros. Max order: €10,000" },
          { status: 400 }
        )
      }
      if (amount <= 0) {
        return NextResponse.json(
          { error: "Amount must be positive" },
          { status: 400 }
        )
      }
    }

    // Si hay orderId, leer el total desde Firestore
    if (orderId) {
      if (getApps().length === 0) {
        return NextResponse.json(
          { error: "Base de datos no disponible para verificar el pedido." },
          { status: 503 }
        )
      }

      const db = getFirestore()
      const orderSnap = await db.collection("orders").doc(orderId).get()

      if (!orderSnap.exists) {
        return NextResponse.json(
          { error: `Pedido ${orderId} no encontrado.` },
          { status: 404 }
        )
      }

      const orderData = orderSnap.data()
      if (!orderData) {
        return NextResponse.json(
          { error: `Pedido ${orderId} no tiene datos válidos.` },
          { status: 404 }
        )
      }

      // SECURITY: Verify order ownership — customer must own the order they're paying for
      if (orderData.customerUid !== userId) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        )
      }

      // Evitar duplicar el pago si ya está pagado
      if (orderData.paymentStatus === "PAID") {
        return NextResponse.json(
          { error: "Este pedido ya ha sido pagado." },
          { status: 409 }
        )
      }

      // Si la orden ya tiene un PaymentIntent, recuperarlo en lugar de crear uno nuevo
      if (orderData.paymentIntentId) {
        try {
          const existingPi = await stripe.paymentIntents.retrieve(orderData.paymentIntentId)
          if (
            existingPi.status !== "canceled" &&
            existingPi.status !== "succeeded"
          ) {
            return NextResponse.json({
              clientSecret: existingPi.client_secret,
              paymentIntentId: existingPi.id,
              reused: true,
            })
          }
        } catch (err) {
          // PaymentIntent no válido, crear uno nuevo
          console.warn("[payments/create] PaymentIntent inválido:", orderData.paymentIntentId, err)
        }
      }

      // Calcular importe desde los items del pedido
      amount = Math.round((orderData.total ?? 0) * 100)
    }

    // Validar importe
    if (!amount || amount < 50) {
      return NextResponse.json(
        { error: "Importe inválido. Mínimo 0,50 €." },
        { status: 400 }
      )
    }

    if (amount > 50000) {
      return NextResponse.json(
        { error: "Importe demasiado alto." },
        { status: 400 }
      )
    }

    // Crear PaymentIntent con clave de idempotencia para evitar duplicados
    // amount is already in cents from earlier conversion
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: orderId || "",
        customerName: customerName || "",
        customerEmail: customerEmail || "",
        source: "raiz_app_retry",
      },
      ...(customerEmail && { receipt_email: customerEmail }),
      description: `Raíz y Grano — Pago${orderId ? ` pedido #${orderId.slice(-6).toUpperCase()}` : ""}`,
    }, {
      idempotencyKey: `pi-${orderId || customerEmail || "anon"}-${Date.now()}`,
    })

    // Si hay orderId, guardar el nuevo PaymentIntent en la orden
    if (orderId && getApps().length > 0) {
      try {
        const db = getFirestore()
        await db.collection("orders").doc(orderId).update({
          paymentIntentId: paymentIntent.id,
          paymentStatus: "PENDING",
        })
      } catch (err) {
        console.warn("[payments/create] No se pudo actualizar la orden:", err)
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: unknown) {
    console.error("[payments/create] Error:", error)

    if (error instanceof Error && "type" in error && typeof (error as Record<string, unknown>).type === "string" && ((error as Record<string, unknown>).type as string).startsWith("Stripe")) {
      return NextResponse.json(
        { error: error.message || "Error en el procesador de pagos" },
        { status: 402 }
      )
    }

    return NextResponse.json(
      { error: "Error interno." },
      { status: 500 }
    )
  }
}
