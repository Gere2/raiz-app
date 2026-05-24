"use client"

/**
 * Wrapper de Stripe Elements para flujos del bono.
 *
 * Se le pasa un `clientSecret` (de purchase-init o redeem) y un `returnUrl`
 * relativo. Monta `<Elements>` con appearance acorde a la marca y un
 * `<PaymentElement>` (layout="tabs", soporta tarjeta + Apple/Google Pay).
 *
 * Tras `confirmPayment` exitoso sin redirect, llama `onSuccess()`. Si Stripe
 * redirige (3DS / wallets), la vuelta cae en `returnUrl` (por convención
 * `/bono/comprar/exito` o `/bono/pedir/exito`), donde el snapshot del pass
 * refleja el cambio.
 *
 * Patrón inspirado en `apps/app/app/checkout/page.tsx` (PaymentElement inline)
 * pero extraído como componente reusable para que /bono/comprar y /bono/pedir
 * compartan exactamente el mismo bloque de pago.
 */

import { useState } from "react"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import type { StripeElementsOptions } from "@stripe/stripe-js"
import { stripePromise } from "@/lib/stripe"
import { useLanguage } from "@/components/language-provider"

interface StripePaymentSectionProps {
  /** Devuelto por Brain en `/purchase-init` o `/redeem`. */
  clientSecret: string
  /** Path relativo (ej. "/bono/comprar/exito"). Se convierte a absolute. */
  returnUrl: string
  /** Callback cuando el pago es exitoso sin redirect (camino feliz tarjeta). */
  onSuccess?: () => void
  /** Texto del botón confirmar; default "Confirmar pago". */
  submitLabel?: string
}

const APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "stripe",
  variables: {
    colorPrimary: "#3f7e54", // leaf-600
    colorBackground: "#ffffff",
    colorText: "#312219", // brand-900
    colorDanger: "#dc2626",
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderRadius: "12px",
  },
}

export function StripePaymentSection(props: StripePaymentSectionProps) {
  const options: StripeElementsOptions = {
    clientSecret: props.clientSecret,
    appearance: APPEARANCE,
  }
  return (
    <Elements stripe={stripePromise} options={options}>
      <InnerForm {...props} />
    </Elements>
  )
}

function InnerForm({
  returnUrl,
  onSuccess,
  submitLabel,
}: StripePaymentSectionProps) {
  const stripe = useStripe()
  const elements = useElements()
  const { locale } = useLanguage()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const absoluteReturnUrl =
      typeof window !== "undefined"
        ? window.location.origin + returnUrl
        : returnUrl

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: absoluteReturnUrl },
      redirect: "if_required",
    })

    if (confirmError) {
      // Errores de validación o cobro fallido — Stripe ya describió por qué.
      setError(confirmError.message ?? (locale === "es" ? "Error al pagar" : "Payment error"))
      setSubmitting(false)
      return
    }

    // Sin redirect: pago confirmado en este lado. Webhook hará el resto.
    setSubmitting(false)
    onSuccess?.()
  }

  const labelDefault = locale === "es" ? "Confirmar pago" : "Confirm payment"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ layout: "tabs" }}
      />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || !ready || submitting}
        className="w-full rounded-2xl bg-leaf-600 px-4 py-4 font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? locale === "es"
            ? "Procesando…"
            : "Processing…"
          : (submitLabel ?? labelDefault)}
      </button>
    </form>
  )
}
