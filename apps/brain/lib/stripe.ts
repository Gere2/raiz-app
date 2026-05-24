/**
 * Stripe — lazy singleton para Brain.
 *
 * Lee `STRIPE_SECRET_KEY` desde el entorno la primera vez que alguien lo pide,
 * para no romper el build de Vercel cuando la var aún no esté presente.
 *
 * Solo se usa server-side: NO importar desde componentes cliente.
 */
import Stripe from "stripe"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY no está configurada en el entorno de Brain.",
    )
  }
  _stripe = new Stripe(key, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  })
  return _stripe
}
