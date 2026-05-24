"use client"

/**
 * /bono/pedir — Wizard de canje del bono.
 *
 * Guards:
 *  - Sin sesión → /login.
 *  - Sin pass active (none/expired/canceled/completed) → /bono.
 *  - Pass pending → mensaje "Estamos confirmando tu bono".
 *  - Sin créditos disponibles → mensaje y /bono.
 *  - Máximo diario alcanzado → mensaje y /bono.
 *
 * El estado del wizard vive en query string; ver `wizard-state.ts`.
 */

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { useExamPass, type Locale } from "@/lib/exam-pass"
import { ExamPassOrderWizard } from "@/components/exam-pass/ExamPassOrderWizard"

function PedirContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const ep = useExamPass()

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?redirect=/bono/pedir")
  }, [authLoading, user, router])

  // No tiene pass active. Si está pending lo mostramos abajo; si no, mandamos a /bono.
  useEffect(() => {
    if (ep.loading || authLoading || !user) return
    if (ep.state === "none") {
      router.replace("/bono")
    }
  }, [ep.loading, ep.state, authLoading, user, router])

  if (authLoading || !user || ep.loading) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-400" />
      </main>
    )
  }

  if (ep.state === "pending") {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-600" />
          <h2 className="font-bold text-amber-900">
            {locale === "es" ? "Estamos confirmando tu bono" : "Confirming your pass"}
          </h2>
          <p className="text-sm text-amber-700">
            {locale === "es"
              ? "En cuanto se confirme el pago podrás pedir."
              : "As soon as the payment confirms, you'll be able to order."}
          </p>
        </div>
        <Link
          href="/bono"
          className="block text-center text-sm text-brand-500 underline hover:text-brand-700"
        >
          {locale === "es" ? "Volver" : "Back"}
        </Link>
      </main>
    )
  }

  // state === "active": validar elegibilidad antes de mostrar el wizard.
  if (ep.creditsAvailable <= 0) {
    return (
      <BlockedState
        title={locale === "es" ? "Sin créditos" : "No credits left"}
        body={
          locale === "es"
            ? "Has usado los 10 cafés de tu bono. Compra otro para seguir."
            : "You've used all 10 coffees on your pass. Buy a new one to keep going."
        }
        cta={{
          href: "/bono/comprar",
          label: locale === "es" ? "Comprar otro bono" : "Buy another pass",
        }}
      />
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <ExamPassOrderWizard />
    </main>
  )
}

interface BlockedStateProps {
  title: string
  body: string
  cta: { href: string; label: string }
}

function BlockedState({ title, body, cta }: BlockedStateProps) {
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="rounded-2xl border border-brand-200/70 bg-white p-6 text-center space-y-3">
        <h2 className="text-xl font-bold text-brand-900">{title}</h2>
        <p className="text-sm text-brand-700">{body}</p>
      </div>
      <Link
        href={cta.href}
        className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
      >
        {cta.label}
      </Link>
    </main>
  )
}

export default function PedirPage() {
  // useSearchParams (vía wizard) requiere Suspense en App Router.
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-6" />}>
      <PedirContent />
    </Suspense>
  )
}
