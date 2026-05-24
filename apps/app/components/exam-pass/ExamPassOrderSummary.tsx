"use client"

/**
 * Pantalla de resumen — la pieza más sensible para evitar reclamaciones.
 *
 * Distingue de forma EXPLÍCITA:
 *  - "Hoy pagarás X €" (suplementos en metálico).
 *  - "También se descontará 1 crédito" (bono).
 *  - "Te quedarán Y de 10 cafés" (estado tras consumir).
 *
 * El desglose visual sale de `buildOrderSummary` (Fase 1), que ya formatea
 * cada línea con los helpers consistentes — ningún componente arma labels a
 * mano.
 */

import { useLanguage } from "@/components/language-provider"
import {
  buildOrderSummary,
  formatEuros,
  formatRemainingCreditsAfter,
  type ExamPassOrderQuote,
  type Locale,
} from "@/lib/exam-pass"

interface ExamPassOrderSummaryProps {
  quote: ExamPassOrderQuote
  /** Créditos usados hoy en el pass ANTES de este canje. */
  creditsUsedBefore: number
  /** Total de créditos del pass (10 en v1). */
  creditsTotal: number
}

export function ExamPassOrderSummary({
  quote,
  creditsUsedBefore,
  creditsTotal,
}: ExamPassOrderSummaryProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const summary = buildOrderSummary(quote, locale)
  const usedAfter = creditsUsedBefore + 1

  const labels =
    locale === "es"
      ? {
          title: "Resumen de tu pedido",
          payNow: "Hoy pagarás",
          alsoDeducted: "También se descontará",
          oneCredit: "1 crédito de tu bono",
          fineprint:
            "Los suplementos se pagan ahora. El crédito del bono se descuenta al confirmar el pedido.",
        }
      : {
          title: "Order summary",
          payNow: "You'll pay today",
          alsoDeducted: "Also deducted",
          oneCredit: "1 credit from your pass",
          fineprint:
            "Extras are paid now. The pass credit is deducted upon confirmation.",
        }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-brand-900">{labels.title}</h2>

      {/* Líneas de pedido */}
      <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
        {summary.lines.map((line, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-3 py-2"
          >
            <span className="text-xs uppercase tracking-wide text-brand-500">
              {line.label}
            </span>
            <span className="text-sm font-medium text-brand-900">
              {line.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bloque "Hoy pagarás" */}
      <div className="rounded-2xl bg-leaf-50 border border-leaf-300 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-brand-700">
            {labels.payNow}
          </span>
          <span className="text-2xl font-bold text-brand-900">
            {formatEuros(quote.totalSupplement, locale)}
          </span>
        </div>

        <div className="border-t border-leaf-200" />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-brand-700">
            {labels.alsoDeducted}
          </span>
          <span className="text-sm font-semibold text-brand-900">
            {labels.oneCredit}
          </span>
        </div>

        <p className="text-sm font-medium text-leaf-700">
          {formatRemainingCreditsAfter(usedAfter, creditsTotal, locale)}
        </p>
      </div>

      <p className="text-xs italic text-brand-500">{labels.fineprint}</p>
    </div>
  )
}
