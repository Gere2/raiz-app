"use client"

/**
 * Barra de progreso del bono: "X de 10 cafés".
 *
 * Lee el estado del pass desde campos puros (used/total). El texto se compone
 * con `formatRemainingCredits` para mantener una única fuente de copy.
 */

import { useLanguage } from "@/components/language-provider"
import { formatRemainingCredits } from "@/lib/exam-pass"
import type { Locale } from "@/lib/exam-pass"

interface ExamPassProgressProps {
  used: number
  total: number
  /** Si true, oculta el texto y solo muestra la barra. */
  barOnly?: boolean
}

export function ExamPassProgress({ used, total, barOnly = false }: ExamPassProgressProps) {
  const { locale } = useLanguage()
  const ratio = total > 0 ? Math.min(1, Math.max(0, used / total)) : 0
  const filledPct = Math.round(ratio * 100)

  return (
    <div className="space-y-2">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-leaf-600 transition-all"
          style={{ width: `${filledPct}%` }}
        />
      </div>
      {!barOnly && (
        <p className="text-sm font-medium text-brand-700">
          {formatRemainingCredits(used, total, locale as Locale)}
        </p>
      )}
    </div>
  )
}
