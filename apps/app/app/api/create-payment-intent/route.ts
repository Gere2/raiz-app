import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { rateLimit } from "@/lib/rate-limiter"

// Payment endpoint: strict limit — 5 requests per minute per IP
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: "Demasiados intentos de pago. Espera un momento." })

// Validar env vars al inicio (falla rápido si faltan)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  console.error("[Stripe] STRIPE_SECRET_KEY no está configurada.")
}

function getStripe(): Stripe | null {
  if (!stripeSecretKey) return null
  return new Stripe(stripeSecretKey, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion })
}

// Initialize Firebase Admin for token verification
function initFirebaseAdmin() {
  if (getApps().length > 0) return
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    if (!projectId) return

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(serviceAccount) })
      } catch (err) {
        console.error("[Payment] Error parsing Firebase service account:", err)
      }
    } else {
      initializeApp({ projectId })
    }
  } catch (err) {
    console.error("[Payment] Error initializing Firebase Admin:", err)
  }
}

initFirebaseAdmin()

// Verify Firebase Auth token and return decoded token claims
async function verifyAuthToken(request: NextRequest): Promise<{ uid: string; email?: string } | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  try {
    const token = authHeader.substring(7)
    if (getApps().length === 0) {
      console.warn("[Payment] Firebase Admin not initialized")
      return null
    }

    const auth = getAuth()
    const decodedToken = await auth.verifyIdToken(token)
    return {
      uid: decodedToken.uid,
      email: decodedToken.email
    }
  } catch (err) {
    console.error("[Payment] Token verification failed:", err)
    return null
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const limited = limiter.check(request)
  if (limited) return limited

  // Verify authentication token
  const tokenClaims = await verifyAuthToken(request)
  if (!tokenClaims) {
    return NextResponse.json(
      { error: "Unauthorized. Valid Firebase auth token required." },
      { status: 401 }
    )
  }
  const userId = tokenClaims.uid
  const tokenEmail = tokenClaims.email

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: "Servicio de pagos no configurado. Contacta con el administrador." },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()

    // Validate body schema before destructuring
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const { amount, customerEmail, customerName, orderId } = body

    // SECURITY: Verify customer email against authenticated token claims
    // Use token email for Stripe customer, warn if request body doesn't match
    const emailToUse = tokenEmail || customerEmail
    if (customerEmail && tokenEmail && customerEmail.toLowerCase() !== tokenEmail.toLowerCase()) {
      console.warn(
        `[Payment] Email mismatch for user ${userId}: body sent '${customerEmail}' but token has '${tokenEmail}'. Using token email.`
      )
    }

    // Validate required fields and types
    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "El campo 'amount' es requerido" },
        { status: 400 }
      )
    }

    if (typeof amount !== "number") {
      return NextResponse.json(
        { error: "El campo 'amount' debe ser un número" },
        { status: 400 }
      )
    }

    /**
     * Amount must be in cents (Stripe requirement).
     * - Minimum: 50 cents (0.50€)
     * - Maximum: 50000 cents (500€)
     * - Must be an integer (no decimal cents)
     */
    if (!Number.isInteger(amount)) {
      return NextResponse.json(
        { error: "El importe debe ser un número entero en céntimos" },
        { status: 400 }
      )
    }

    if (amount < 50) {
      return NextResponse.json(
        { error: "El importe mínimo es 50 céntimos (0,50 €)" },
        { status: 400 }
      )
    }

    // Validar que el importe es razonable (máx 500€ por seguridad)
    if (amount > 50000) {
      return NextResponse.json(
        { error: "Importe demasiado alto. Por favor contacta con nosotros." },
        { status: 400 }
      )
    }

    // Crear PaymentIntent (importe en céntimos)
    // SECURITY: Use verified token email instead of untrusted request body email
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: orderId || "",
        customerName: customerName || "",
        customerEmail: emailToUse || "",
        source: "raiz_app",
      },
      ...(emailToUse && { receipt_email: emailToUse }),
      description: `Raíz y Grano — Pedido APP${orderId ? ` #${orderId}` : ""}`,
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: unknown) {
    console.error("[Stripe] Error creando PaymentIntent:", error)

    // Distinguir errores de Stripe vs errores internos
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message || "Error en el procesador de pagos" },
        { status: 402 }
      )
    }

    return NextResponse.json(
      { error: "Error interno procesando el pago" },
      { status: 500 }
    )
  }
}
