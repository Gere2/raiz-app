"use client"

/**
 * /bono/comprar/exito — Pantalla post-pago.
 *
 * Stripe redirige aquí si el método requirió 3DS / wallet. En el camino feliz
 * sin redirect, /bono/comprar nos manda aquí tras `confirmPayment` exitoso.
 *
 * El estado del bono se sigue en vivo con `useExamPass` (snapshot Firestore).
 * Mientras el webhook procesa el `succeeded`, vemos `state="pending"`. Tan
 * pronto el webhook activa el pass, salta a `state="active"`.
 *
 * Stripe pasa `?payment_intent=...&redirect_status=succeeded|...` en la URL
 * cuando hay redirect. No los necesitamos para nada (la fuente de verdad es el
 * webhook + snapshot del pass), pero los respetamos por si queremos mostrar
 * estados "failed" inmediatos.
 */

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Loader2, XCircle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { useExamPass, type Locale } from "@/lib/exam-pass"
import { ExamPassProgress } from "@/components/exam-pass/ExamPassProgress"

/** Tras este tiempo, si seguimos en pending mostramos "reintentar/cancelar". */
const PENDING_GRACE_MS = 8000

function ExitoContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const ep = useExamPass()

  const stripeRedirectStatus = params.get("redirect_status") // succeeded|processing|...

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

  // Stripe nos avisó de redirect_status === "failed" → mostramos error.
  if (stripeRedirectStatus === "failed" || stripeRedirectStatus === "requires_payment_method") {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="text-xl font-bold text-red-900">
            {locale === "es" ? "Pago no completado" : "Payment not completed"}
          </h1>
          <p className="text-sm text-red-700">
            {locale === "es"
              ? "El pago no se ha podido procesar. Inténtalo de nuevo."
              : "Your payment couldn't be processed. Please try again."}
          </p>
        </div>
        <Link
          href="/bono/comprar"
          className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Reintentar compra" : "Retry purchase"}
        </Link>
      </main>
    )
  }

  // Pending: el webhook todavía no ha activado.
  if (ep.state === "pending" || (ep.state === "loading" && stripeRedirectStatus !== "succeeded" && !ep.pass)) {
    return <PendingExito ep={ep} locale={locale} />
  }

  // Active: éxito visible.
  if (ep.state === "active" && ep.pass) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-leaf-300 bg-leaf-50 p-6 space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leaf-100">
            <Check className="h-8 w-8 text-leaf-700" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-brand-900">
              {locale === "es" ? "¡Tu bono está listo!" : "Your pass is ready!"}
            </h1>
            <p className="text-sm text-brand-700">
              {locale === "es"
                ? "Te quedan 10 cafés por delante. Pídelos cuando los necesites."
                : "10 coffees ahead. Order them whenever you need."}
            </p>
          </div>
          <ExamPassProgress
            used={ep.pass.creditsUsed}
            total={ep.pass.creditsTotal}
          />
        </div>

        <Link
          href="/bono/pedir"
          className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Pedir con mi bono" : "Order with my pass"}
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

  // Edge: state="none" después de pagar significa que algo raro pasó (canceled
  // antes de activar). El usuario verá la card de venta otra vez en /bono.
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="rounded-2xl border border-brand-200/70 bg-white p-5 space-y-3 text-center">
        <h1 className="text-xl font-bold text-brand-900">
          {locale === "es" ? "No se ha activado el bono" : "Pass not activated"}
        </h1>
        <p className="text-sm text-brand-700">
          {locale === "es"
            ? "Si crees que se ha cobrado, escríbenos y lo revisamos."
            : "If you think you were charged, contact us and we'll look into it."}
        </p>
      </div>
      <Link
        href="/bono"
        className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
      >
        {locale === "es" ? "Volver a Bono" : "Back to Pass"}
      </Link>
    </main>
  )
}

/**
 * Banner pending del flujo post-pago.
 *
 * Camino feliz (tarjeta sin 3DS): el snapshot del pass salta a "active" en
 * 1-3 s y este componente nunca se ve más allá del primer parpadeo.
 *
 * Camino abandonado (usuario cierra Stripe sin confirmar y vuelve aquí):
 * tras `PENDING_GRACE_MS` mostramos botones "Reintentar pago" y "Cancelar"
 * para que no se quede atrapado en el spinner para siempre.
 */
function PendingExito({
  ep,
  locale,
}: {
  ep: ReturnType<typeof useExamPass>
  locale: Locale
}) {
  const [graceElapsed, setGraceElapsed] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), PENDING_GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  async function handleCancel() {
    setCancelling(true)
    await ep.cancelPending()
    setCancelling(false)
    // No redirigimos: el snapshot/refresh hará que el componente padre re-renderice
    // y caiga al "no se ha activado el bono" o a la card de venta.
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-amber-600" />
        <h1 className="text-xl font-bold text-amber-900">
          {locale === "es" ? "Activando tu bono…" : "Activating your pass…"}
        </h1>
        <p className="text-sm text-amber-700">
          {locale === "es"
            ? "Estamos confirmando tu pago. Esto suele tardar unos segundos."
            : "We're confirming your payment. This usually takes a few seconds."}
        </p>
      </div>

      {graceElapsed && (
        <div className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3">
          <p className="text-sm text-amber-900">
            {locale === "es"
              ? "Si abandonaste el pago sin completarlo, puedes reintentarlo o cancelar el bono pendiente."
              : "If you left the payment unfinished, you can retry it or cancel the pending pass."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/bono/comprar"
              className="rounded-xl bg-leaf-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98]"
            >
              {locale === "es" ? "Reintentar pago" : "Retry payment"}
            </Link>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              {cancelling
                ? locale === "es" ? "Cancelando…" : "Cancelling…"
                : locale === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function ExitoPage() {
  // useSearchParams requiere Suspense en Next 14 App Router.
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-6" />}>
      <ExitoContent />
    </Suspense>
  )
}
