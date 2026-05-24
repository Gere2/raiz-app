"use client"

/**
 * Tarjeta principal del bono. Tres caras según el estado:
 *  - none:    venta. Precio + early-bird remaining + CTA "Comprar".
 *  - pending: "Estamos confirmando tu pago…".
 *  - active:  "Mi bono" con progress + CTA "Pedir con mi bono".
 *
 * Pensada para insertarse:
 *  - en `/bono` (variante `full`),
 *  - en home (variante `compact`, sin secciones secundarias).
 */

import { useState } from "react"
import Link from "next/link"
import { Coffee, Sparkles, Loader2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  formatEuros,
  type Locale,
  useExamPass,
} from "@/lib/exam-pass"
import { ExamPassProgress } from "./ExamPassProgress"
import { BonoLastOrderCard } from "./BonoLastOrderCard"
import { ExamPassIncludedShort } from "./ExamPassIncludedTable"

interface ExamPassCardProps {
  /** "full" muestra todo; "compact" es para home. */
  variant?: "full" | "compact"
}

export function ExamPassCard({ variant = "full" }: ExamPassCardProps) {
  const ep = useExamPass()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  // Sin sesión, mostramos la card de venta igualmente (state="none"). El
  // botón "Comprar bono" lleva a /bono/comprar, que redirigirá a login si
  // hace falta. Así el visitante anónimo ve la promo en home.

  // No bloqueamos con spinner si tenemos algún dato (cache local o
  // respuesta parcial). La home siempre muestra "algo" — la card de venta
  // default si no hay nada — y el contenido se actualiza cuando Brain
  // responde. Esto evita el "se queda cargando 2 minutos" en home cuando
  // Brain está cold/lento.

  if (ep.state === "pending") {
    return <PendingBlock locale={locale} ep={ep} />
  }

  if (ep.state === "active" && ep.pass) {
    return (
      <>
        <div className="rounded-2xl border border-leaf-300 bg-leaf-50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-leaf-700" />
            <h3 className="text-lg font-bold text-brand-900">
              {locale === "es"
                ? "Bono Supervivencia Exámenes"
                : "Exam Survival Pass"}
            </h3>
          </div>
          <ExamPassProgress
            used={ep.pass.creditsUsed}
            total={ep.pass.creditsTotal}
          />
          {ep.expiresAt && (
            <p className="text-xs text-brand-500">
              {locale === "es" ? "Válido hasta " : "Valid until "}
              {new Date(ep.expiresAt).toLocaleDateString(
                locale === "es" ? "es-ES" : "en-IE",
                { day: "numeric", month: "long", year: "numeric" },
              )}
            </p>
          )}
          {!ep.canRedeem && ep.pass && (
            <p className="text-xs text-amber-700">
              {locale === "es"
                ? "Has usado todos tus cafés."
                : "You've used all your coffees."}
            </p>
          )}
          <Link
            href="/bono/pedir"
            aria-disabled={!ep.canRedeem}
            className={`block w-full rounded-2xl py-3 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 active:scale-[0.98] ${
              ep.canRedeem
                ? "bg-leaf-600 hover:bg-leaf-700"
                : "pointer-events-none bg-brand-300"
            }`}
          >
            {locale === "es" ? "Pedir con mi bono" : "Order with my pass"}
          </Link>
          {variant === "full" && (
            <Link
              href="/bono/condiciones"
              className="block text-center text-sm text-brand-500 hover:text-brand-700 underline"
            >
              {locale === "es" ? "Ver condiciones" : "View conditions"}
            </Link>
          )}
        </div>

        {/* Repetir último pedido — solo en /bono (variant=full) y si hay
            un canje consumido previo. En home (compact) no la mostramos
            para no sobrecargar. */}
        {variant === "full" && ep.lastRedemption && (
          <BonoLastOrderCard
            redemption={ep.lastRedemption}
            canRedeem={ep.canRedeem}
          />
        )}
      </>
    )
  }

  // state === "none" → tarjeta de venta
  const price = ep.quote?.price ?? 20
  const earlyBirdRemaining = ep.quote?.earlyBirdRemaining ?? 0
  const isEarlyBird = earlyBirdRemaining > 0

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-leaf-50 p-2">
          <Coffee className="h-6 w-6 text-leaf-700" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-brand-900">
            {locale === "es"
              ? "Bono Supervivencia Exámenes"
              : "Exam Survival Pass"}
          </h3>
          <p className="text-sm text-brand-500">
            {locale === "es"
              ? "10 bebidas base para estudiar mejor"
              : "10 base drinks to study better"}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-brand-900">
            {formatEuros(price, locale)}
          </span>
          {isEarlyBird && (
            <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-bold text-leaf-700">
              {locale === "es" ? "Early-bird" : "Early-bird"}
            </span>
          )}
        </div>
        {isEarlyBird && (
          <p className="text-xs text-brand-500">
            {locale === "es"
              ? `Quedan ${earlyBirdRemaining} bonos a este precio. Después: ${formatEuros(22, locale)}.`
              : `${earlyBirdRemaining} passes left at this price. After: ${formatEuros(22, locale)}.`}
          </p>
        )}
      </div>

      <p className="text-sm text-brand-700">
        {locale === "es"
          ? "Válido durante 60 días."
          : "Valid for 60 days."}
      </p>

      {variant === "full" && <ExamPassIncludedShort />}

      <Link
        href="/bono/comprar"
        className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98]"
      >
        {locale === "es" ? "Comprar bono" : "Buy pass"}
      </Link>

      <p className="text-xs text-brand-400">
        {locale === "es"
          ? "Cada bebida canjeada consume 1 crédito. Los suplementos se pagan aparte al hacer el pedido."
          : "Each redeemed drink uses 1 credit. Extra charges are paid at the time of order."}
      </p>
    </div>
  )
}

/**
 * Bloque "pago en proceso" con dos acciones:
 *  - Continuar pago: lleva a /bono/comprar, que reusa el PaymentIntent
 *    existente (anti-pending) o crea uno nuevo si el viejo ya murió.
 *  - Cancelar: llama a `cancelPending` y deja al usuario en state="none"
 *    para que pueda empezar de nuevo o decidir.
 *
 * Sin TTL: si el usuario llegó a este banner es porque abrió la app y vio
 * el pending — la decisión la toma él.
 */
function PendingBlock({
  locale,
  ep,
}: {
  locale: Locale
  ep: ReturnType<typeof useExamPass>
}) {
  const [busy, setBusy] = useState(false)

  async function handleCancel() {
    setBusy(true)
    const r = await ep.cancelPending()
    setBusy(false)
    if (!r.ok) {
      // No fatal: refrescamos por si el webhook ya lo activó en paralelo.
      void ep.refresh()
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        <h3 className="font-bold">
          {locale === "es" ? "Pago de bono en proceso" : "Pass payment in progress"}
        </h3>
      </div>
      <p className="text-sm text-amber-700">
        {locale === "es"
          ? "Tu pago aún no se ha confirmado. Si lo abandonaste, puedes reintentarlo o cancelarlo."
          : "Your payment isn't confirmed yet. If you left it, you can retry or cancel."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/bono/comprar"
          className="rounded-xl bg-leaf-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Continuar pago" : "Continue payment"}
        </Link>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          {busy
            ? locale === "es" ? "Cancelando…" : "Cancelling…"
            : locale === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </div>
  )
}
