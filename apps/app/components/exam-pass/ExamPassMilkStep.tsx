"use client"

/**
 * Paso 2 — elige leche.
 *
 * Solo se renderiza cuando la bebida seleccionada lleva leche
 * (filtrado en el wrapper, no aquí). Muestra la nota legal sobre suplementos
 * solo si alguna leche tiene suplemento (>= 1 leche vegetal en el catálogo).
 */

import { Check } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  MILK_OPTIONS,
  formatIncludedFem,
  formatPlusEuros,
  type Locale,
  type MilkId,
} from "@/lib/exam-pass"

interface ExamPassMilkStepProps {
  selectedMilkId?: MilkId
  onSelect: (id: MilkId) => void
}

export function ExamPassMilkStep({
  selectedMilkId,
  onSelect,
}: ExamPassMilkStepProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const hasSupplementMilk = MILK_OPTIONS.some((m) => m.supplement > 0)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-brand-900">
          {locale === "es" ? "Elige tu leche" : "Choose your milk"}
        </h2>
        <p className="text-sm text-brand-500">
          {locale === "es"
            ? "Algunas leches tienen pequeño suplemento dentro del bono."
            : "Some milks carry a small extra charge inside the pass."}
        </p>
      </header>

      <div className="grid gap-2">
        {MILK_OPTIONS.map((m) => {
          const label =
            m.supplement > 0
              ? formatPlusEuros(m.supplement, locale)
              : formatIncludedFem(locale)
          const selected = selectedMilkId === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                selected
                  ? "border-leaf-500 bg-leaf-50 shadow-sm"
                  : "border-brand-200/70 bg-white hover:border-brand-300"
              }`}
              aria-pressed={selected}
            >
              <div>
                <div className="font-semibold text-brand-900">
                  {locale === "es" ? m.name : m.nameEn}
                </div>
                <div className="text-sm text-brand-500">{label}</div>
              </div>
              {selected && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-600 text-white">
                  <Check className="h-4 w-4" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {hasSupplementMilk && (
        <p className="text-xs italic text-brand-500">
          {locale === "es"
            ? "Este suplemento solo aplica al usar el Bono Exámenes."
            : "This extra charge only applies when using the Exam Pass."}
        </p>
      )}
    </div>
  )
}
