"use client"

/**
 * /bono/pedir/resumen — Resumen previo a confirmar.
 *
 * Flujo simple: el cliente confirma → consumimos el crédito → creamos un
 * order para el POS → redirigimos a /exito. Si hay suplemento, el barista
 * lo cobra en barra al entregar (el order queda paymentStatus="PENDING").
 *
 * Sin Stripe en este flujo. Los suplementos se pagan en caja.
 */

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import {
  computeOrder,
  findExtra,
  findPastry,
  formatEligibilityMessage,
  formatEuros,
  type ExamPassOrderInput,
  type ExamPassOrderQuote,
  type Locale,
  useExamPass,
} from "@/lib/exam-pass"
import { createOrder } from "@/lib/services/order-service"
import { ExamPassOrderSummary } from "@/components/exam-pass/ExamPassOrderSummary"
import { readSelection } from "@/components/exam-pass/wizard-state"

/**
 * Construye el doc `orders` que verá el AppOrdersPanel del POS.
 *
 * Items: bebida principal (con modifier de leche), extras y pastry como
 * líneas separadas — así el barista ve cada cosa con su precio. La suma de
 * unitPrice * qty cuadra con `total` (= totalSupplement del bono).
 *
 * paymentMethod: siempre "CASH" — los suplementos se pagan en barra al
 * recoger. El POS marcará paymentStatus="PAID" al cobrar (manualmente).
 *
 * paymentStatus:
 *   - total === 0  → "PAID" (sin coste; el bono cubre todo).
 *   - total > 0    → "PENDING" — el barista cobra al entregar.
 */
async function createPosOrderForBono(args: {
  user: { uid: string; email: string | null; displayName: string | null }
  quote: ExamPassOrderQuote
  locale: Locale
}) {
  const { user, quote, locale } = args
  const total = quote.totalSupplement
  const isFree = total === 0

  // Item principal: bebida + leche como modifier. El precio incluye el
  // suplemento base (premium) y el de leche, todo lo "atado" a la bebida.
  const drinkPrice =
    Math.round((quote.basePremiumSupplement + quote.milkSupplement) * 100) / 100

  const items: Parameters<typeof createOrder>[0]["items"] = [
    {
      product: {
        id: quote.productId,
        name: locale === "es" ? quote.productName : quote.productNameEn,
        price: drinkPrice,
      },
      qty: 1,
      ...(quote.milkId ? { modifiers: { milk: quote.milkId } } : {}),
    },
  ]

  // Extras como líneas separadas.
  for (const extraId of quote.extras) {
    const ex = findExtra(extraId)
    if (!ex) continue
    items.push({
      product: {
        id: `extra:${extraId}`,
        name: locale === "es" ? ex.name : ex.nameEn,
        price: ex.supplement,
      },
      qty: 1,
    })
  }

  // Pastry como línea aparte.
  if (quote.pastryId) {
    const p = findPastry(quote.pastryId)
    if (p) {
      items.push({
        product: {
          id: `pastry:${quote.pastryId}`,
          name: locale === "es" ? p.name : p.nameEn,
          price: p.bonoPrice,
        },
        qty: 1,
      })
    }
  }

  const noteHeader = "🎟️ Bono Exámenes · 1 crédito consumido"
  const noteSuffix = isFree
    ? " · sin coste extra"
    : ` · cobrar ${formatEuros(total, locale)} en barra`

  return createOrder({
    userId: user.uid,
    customerName: user.displayName ?? user.email ?? "Cliente",
    customerEmail: user.email ?? "",
    items,
    total,
    pickupType: "ASAP",
    notes: noteHeader + noteSuffix,
    paymentMethod: "CASH",
    paymentStatus: isFree ? "PAID" : "PENDING",
  })
}

function ResumenContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const ep = useExamPass()

  const [submitting, setSubmitting] = useState(false)

  // Reconstruimos la selección desde la URL.
  const sel = useMemo(() => readSelection(params), [params])

  // Auth guard.
  useEffect(() => {
    if (!authLoading && !user) router.push("/login?redirect=/bono/pedir")
  }, [authLoading, user, router])

  // Sin pass active → fuera.
  useEffect(() => {
    if (ep.loading || authLoading || !user) return
    if (ep.state === "none") router.replace("/bono")
    else if (ep.state === "pending") router.replace("/bono/pedir")
  }, [ep.loading, ep.state, authLoading, user, router])

  if (authLoading || !user || ep.loading) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-400" />
      </main>
    )
  }

  if (!sel.productId) {
    // El usuario llegó sin elegir bebida — mandamos al inicio del wizard.
    router.replace("/bono/pedir")
    return null
  }

  // Cálculo puro. Si la combinación es inválida, mostramos error con CTA atrás.
  const input: ExamPassOrderInput = {
    productId: sel.productId,
    milkId: sel.milkId ?? null,
    extras: sel.extras,
    pastryId: sel.pastryId ?? null,
  }
  const validation = computeOrder(input)

  if (!validation.ok) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-2 text-center">
          <h2 className="font-bold text-red-900">
            {locale === "es" ? "Selección inválida" : "Invalid selection"}
          </h2>
          <p className="text-sm text-red-700">{validation.error}</p>
        </div>
        <Link
          href="/bono/pedir"
          className="block w-full rounded-2xl bg-leaf-600 px-4 py-4 text-center font-semibold text-white shadow-lg hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Volver al wizard" : "Back to wizard"}
        </Link>
      </main>
    )
  }

  const quote = validation.quote
  const passUsed = ep.pass?.creditsUsed ?? 0
  const passTotal = ep.pass?.creditsTotal ?? 10

  async function handleConfirm() {
    setSubmitting(true)
    const result = await ep.redeem(input)
    setSubmitting(false)

    if (!result.ok) {
      // Errores de elegibilidad → toast con copy claro.
      const code = result.error.error
      const eligibilityCodes = [
        "PASS_NOT_FOUND",
        "PASS_PENDING_PAYMENT",
        "NO_ACTIVE_PASS",
        "PASS_EXPIRED",
        "NO_CREDITS",
      ] as const
      type ElCode = (typeof eligibilityCodes)[number]
      if ((eligibilityCodes as readonly string[]).includes(code)) {
        const msgKey = code === "NO_ACTIVE_PASS" ? "PASS_NOT_FOUND" : (code as ElCode)
        const msg = formatEligibilityMessage(
          msgKey as Parameters<typeof formatEligibilityMessage>[0],
          locale,
        )
        toast.error(msg)
        if (code === "NO_CREDITS" || code === "PASS_EXPIRED") {
          router.replace("/bono")
        }
        return
      }
      toast.error(
        result.error.message ??
          (locale === "es" ? "Error al confirmar" : "Error confirming"),
      )
      return
    }

    // Crédito consumido. Crear el doc `orders` para el POS — el barista
    // verá el pedido en el panel y cobrará el suplemento al entregar.
    if (user) {
      try {
        await createPosOrderForBono({
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
          quote: result.data.quote,
          locale,
        })
      } catch (err) {
        // No bloquea el flujo: el crédito ya está consumido. Si el order
        // no se creó por algún motivo, el barista no lo verá en el panel
        // pero el cliente sí tendrá el ticket en su histórico.
        console.error("[bono/resumen] createPosOrderForBono falló:", err)
      }
    }

    // Único camino: directo a éxito. El total > 0 ya viene en el quote
    // y la página de éxito lo muestra como "paga X € al recoger".
    const total = result.data.quote.totalSupplement
    router.push(
      total > 0
        ? `/bono/pedir/exito?total=${total}`
        : `/bono/pedir/exito?ok=1`,
    )
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <Link
        href={`/bono/pedir${params.toString() ? `?${params.toString()}` : ""}`}
        className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {locale === "es" ? "Volver al wizard" : "Back to wizard"}
      </Link>

      <ExamPassOrderSummary
        quote={quote}
        creditsUsedBefore={passUsed}
        creditsTotal={passTotal}
      />

      {quote.totalSupplement > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {locale === "es"
            ? `Pagarás ${formatEuros(quote.totalSupplement, locale)} en barra al recoger tu pedido.`
            : `You'll pay ${formatEuros(quote.totalSupplement, locale)} at the counter when picking up your order.`}
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full rounded-2xl bg-leaf-600 px-4 py-4 font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {locale === "es" ? "Procesando…" : "Processing…"}
          </span>
        ) : locale === "es" ? (
          "Confirmar pedido"
        ) : (
          "Confirm order"
        )}
      </button>
    </main>
  )
}

export default function ResumenPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-6" />}>
      <ResumenContent />
    </Suspense>
  )
}
