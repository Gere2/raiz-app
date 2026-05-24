"use client"

/**
 * /bono/pedir/exito — Pantalla post-canje.
 *
 * El crédito se consumió en /resumen (al pulsar "Confirmar pedido"). Si hay
 * suplemento, el barista lo cobra en barra al entregar — la app solo lo
 * informa.
 *
 * Casos:
 *  - ?ok=1            → total 0 €, sin coste extra.
 *  - ?total=<n>       → suplemento N €, cobro pendiente en barra.
 *  - sin params       → llegada inválida, mandamos al wizard.
 */

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, XCircle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import {
  formatEuros,
  formatRemainingCredits,
  type Locale,
  useExamPass,
} from "@/lib/exam-pass"
import { ExamPassProgress } from "@/components/exam-pass/ExamPassProgress"

function ExitoContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const ep = useExamPass()

  const ok = params.get("ok") === "1"
  const totalParam = params.get("total")
  const total = totalParam ? Number(totalParam) : 0
  const hasValidEntry = ok || (totalParam !== null && !Number.isNaN(total))

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?redirect=/bono")
  }, [authLoading, user, router])

  if (authLoading || !user) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <p className="text-sm text-brand-500">
          {locale === "es" ? "Cargando…" : "Loading…"}
        </p>
      </main>
    )
  }

  if (!hasValidEntry) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="text-xl font-bold text-red-900">
            {locale === "es" ? "Pedido no encontrado" : "Order not found"}
          </h1>
          <p className="text-sm text-red-700">
            {locale === "es"
              ? "No vemos tu pedido. ¿Quieres empezar uno nuevo?"
              : "We can't find your order. Want to start a new one?"}
          </p>
        </div>
        <Link
          href="/bono/pedir"
          className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Empezar pedido" : "Start order"}
        </Link>
      </main>
    )
  }

  const used = ep.pass?.creditsUsed ?? 0
  const passTotal = ep.pass?.creditsTotal ?? 10
  const showInStorePayment = total > 0

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="rounded-2xl border border-leaf-300 bg-leaf-50 p-6 space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leaf-100">
          <Check className="h-8 w-8 text-leaf-700" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-brand-900">
            {locale === "es" ? "Pedido confirmado" : "Order confirmed"}
          </h1>
          <p className="text-sm text-brand-700">
            {locale === "es"
              ? "Has usado 1 crédito de tu bono. Recoge tu pedido en barra."
              : "You used 1 credit from your pass. Pick up your order at the counter."}
          </p>
        </div>
        <ExamPassProgress used={used} total={passTotal} barOnly />
        <p className="text-sm font-medium text-brand-700">
          {formatRemainingCredits(used, passTotal, locale)}
        </p>
      </div>

      {showInStorePayment && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1 text-center">
          <p className="text-xs uppercase tracking-wide text-amber-700">
            {locale === "es" ? "Pago en barra" : "Pay at counter"}
          </p>
          <p className="text-2xl font-bold text-amber-900">
            {formatEuros(total, locale)}
          </p>
          <p className="text-xs text-amber-700">
            {locale === "es"
              ? "El barista te cobrará al entregar el pedido."
              : "The barista will charge you when handing over your order."}
          </p>
        </div>
      )}

      <Link
        href="/bono/pedir"
        className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
      >
        {locale === "es" ? "Pedir otro" : "Order another"}
      </Link>
      <Link
        href="/bono"
        className="block text-center text-sm text-brand-500 hover:text-brand-700 underline"
      >
        {locale === "es" ? "Volver a Bono" : "Back to Pass"}
      </Link>
    </main>
  )
}

export default function ExitoPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-6" />}>
      <ExitoContent />
    </Suspense>
  )
}
