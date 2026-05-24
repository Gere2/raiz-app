"use client"

/**
 * /bono/comprar — Pantalla "¿Qué incluye tu bono?" + flujo de pago.
 *
 * Tres fases en la misma página:
 *  1. Resumen + tabla "qué incluye" + CTA "Comprar por X €".
 *  2. Al pulsar: llama `purchaseInit()`. Si OK, salta a fase 3 con clientSecret.
 *  3. Stripe Elements montado: usuario confirma. Tras éxito → /bono/comprar/exito.
 *
 * Anti-pending: si ya tiene `active`, redirige a /bono. Si tiene `pending`,
 * muestra Elements directamente con el clientSecret reusado por purchase-init.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import {
  formatEuros,
  type Locale,
  useExamPass,
} from "@/lib/exam-pass"
import { ExamPassIncludedTable } from "@/components/exam-pass/ExamPassIncludedTable"
import { StripePaymentSection } from "@/components/exam-pass/StripePaymentForm"

type Phase = "review" | "paying"

export default function ComprarPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const ep = useExamPass()

  const [phase, setPhase] = useState<Phase>("review")
  const [paymentInfo, setPaymentInfo] = useState<{
    clientSecret: string
    passId: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Auth guard.
  useEffect(() => {
    if (!authLoading && !user) router.push("/login?redirect=/bono/comprar")
  }, [authLoading, user, router])

  // Si ya tiene bono active, no tiene sentido estar aquí.
  useEffect(() => {
    if (ep.hasActivePass) {
      toast.success(
        locale === "es" ? "Ya tienes un bono activo" : "You already have an active pass",
      )
      router.replace("/bono")
    }
  }, [ep.hasActivePass, router, locale])

  if (authLoading || !user) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <p className="text-sm text-brand-500">
          {locale === "es" ? "Cargando…" : "Loading…"}
        </p>
      </main>
    )
  }

  const price = ep.quote?.price ?? 20
  const earlyBirdRemaining = ep.quote?.earlyBirdRemaining ?? 0

  async function handleStartPayment() {
    setSubmitting(true)
    const result = await ep.purchaseInit()
    setSubmitting(false)
    if (!result.ok) {
      // ACTIVE_PASS_EXISTS u otros — toast + back.
      const msg =
        result.error.error === "ACTIVE_PASS_EXISTS"
          ? locale === "es"
            ? "Ya tienes un bono activo"
            : "You already have an active pass"
          : result.error.message ?? (locale === "es" ? "Error al iniciar la compra" : "Error starting purchase")
      toast.error(msg)
      if (result.error.error === "ACTIVE_PASS_EXISTS") router.replace("/bono")
      return
    }
    setPaymentInfo({
      clientSecret: result.data.clientSecret,
      passId: result.data.passId,
    })
    setPhase("paying")
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <Link
        href="/bono"
        className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {locale === "es" ? "Volver" : "Back"}
      </Link>

      {phase === "review" && (
        <>
          <header className="space-y-2">
            <h1 className="text-2xl font-bold text-brand-900">
              {locale === "es" ? "¿Qué incluye tu bono?" : "What's in your pass?"}
            </h1>
            <p className="text-sm text-brand-700">
              {locale === "es"
                ? "Tu bono cubre la bebida base. Si quieres hacerla más tuya, solo pagas el suplemento."
                : "Your pass covers the base drink. If you want to customise it, you only pay the extra."}
            </p>
          </header>

          {/* Resumen del precio */}
          <section className="rounded-2xl border border-leaf-300 bg-leaf-50 p-5 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-brand-900">
                {formatEuros(price, locale)}
              </span>
              <span className="text-sm text-brand-700">
                {locale === "es" ? "· 10 cafés" : "· 10 coffees"}
              </span>
            </div>
            {earlyBirdRemaining > 0 && (
              <p className="text-xs text-brand-500">
                {locale === "es"
                  ? `Quedan ${earlyBirdRemaining} bonos al precio early-bird. Después: ${formatEuros(22, locale)}.`
                  : `${earlyBirdRemaining} passes left at early-bird. After: ${formatEuros(22, locale)}.`}
              </p>
            )}
            <p className="text-xs text-brand-500">
              {locale === "es" ? "Válido durante 60 días." : "Valid for 60 days."}
            </p>
          </section>

          <ExamPassIncludedTable />

          {/* Condiciones rápidas */}
          <section className="rounded-2xl border border-brand-200/70 bg-white p-4 space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-500">
              {locale === "es" ? "Condiciones" : "Conditions"}
            </h3>
            <ul className="space-y-1 text-sm text-brand-700">
              <li>
                {locale === "es"
                  ? "El bono incluye 10 créditos. Cada crédito = 1 bebida base."
                  : "The pass has 10 credits. Each credit = 1 base drink."}
              </li>
              <li>
                {locale === "es"
                  ? "Los suplementos se pagan al hacer el pedido."
                  : "Extras are paid at order time."}
              </li>
              <li>
                {locale === "es"
                  ? "Válido 60 días desde la compra."
                  : "Valid 60 days from purchase."}
              </li>
              <li>
                {locale === "es"
                  ? "No acumulable con otras promociones."
                  : "Not combinable with other promotions."}
              </li>
            </ul>
            <Link
              href="/bono/condiciones"
              className="inline-block text-sm text-brand-500 hover:text-brand-700 underline"
            >
              {locale === "es" ? "Ver todas las condiciones" : "See all conditions"}
            </Link>
          </section>

          <button
            onClick={handleStartPayment}
            disabled={submitting || ep.loading}
            className="w-full rounded-2xl bg-leaf-600 px-4 py-4 font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {locale === "es" ? "Preparando pago…" : "Preparing payment…"}
              </span>
            ) : (
              `${locale === "es" ? "Comprar por" : "Buy for"} ${formatEuros(price, locale)}`
            )}
          </button>
        </>
      )}

      {phase === "paying" && paymentInfo && (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold text-brand-900">
              {locale === "es" ? "Pago" : "Payment"}
            </h1>
            <p className="text-sm text-brand-500">
              {locale === "es"
                ? `Total: ${formatEuros(price, locale)}`
                : `Total: ${formatEuros(price, locale)}`}
            </p>
          </header>

          <StripePaymentSection
            clientSecret={paymentInfo.clientSecret}
            returnUrl="/bono/comprar/exito"
            onSuccess={() => router.push("/bono/comprar/exito")}
            submitLabel={
              locale === "es"
                ? `Pagar ${formatEuros(price, locale)}`
                : `Pay ${formatEuros(price, locale)}`
            }
          />

          <button
            onClick={() => setPhase("review")}
            className="w-full text-center text-sm text-brand-500 hover:text-brand-700 underline"
          >
            {locale === "es" ? "Volver al resumen" : "Back to summary"}
          </button>
        </>
      )}
    </main>
  )
}
