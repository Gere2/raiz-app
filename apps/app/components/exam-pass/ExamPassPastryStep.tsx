"use client"

/**
 * Paso 4 — dulce (opcional). Selección única (radio): galleta, bizcocho o
 * "no, gracias". Cada card muestra precio bono + precio normal tachado.
 */

import { Check } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  PASTRY_OPTIONS,
  formatPastryLabel,
  type Locale,
  type PastryId,
} from "@/lib/exam-pass"

interface ExamPassPastryStepProps {
  selectedPastryId?: PastryId
  onSelect: (id: PastryId | null) => void
  /**
   * Atajo "no quiero dulce, vamos al resumen". El botón "No, gracias"
   * debe AVANZAR (no sólo deseleccionar). Si no se pasa, el botón hace
   * fallback a `onSelect(null)`.
   */
  onSkip?: () => void
}

export function ExamPassPastryStep({
  selectedPastryId,
  onSelect,
  onSkip,
}: ExamPassPastryStepProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-brand-900">
          {locale === "es" ? "¿Algo para acompañar?" : "Something on the side?"}
        </h2>
        <p className="text-sm text-brand-500">
          {locale === "es"
            ? "Precio especial al pedir con tu bono."
            : "Special price when ordering with your pass."}
        </p>
      </header>

      <div className="grid gap-2">
        {PASTRY_OPTIONS.map((p) => {
          const labels = formatPastryLabel(p.id, locale)
          const selected = selectedPastryId === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(selected ? null : p.id)}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                selected
                  ? "border-leaf-500 bg-leaf-50 shadow-sm"
                  : "border-brand-200/70 bg-white hover:border-brand-300"
              }`}
              aria-pressed={selected}
            >
              <div>
                <div className="font-semibold text-brand-900">
                  {locale === "es" ? p.name : p.nameEn}
                </div>
                <div className="text-sm text-brand-700">{labels.label}</div>
                <div className="text-xs text-brand-400 line-through">
                  {labels.before}
                </div>
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

      <button
        type="button"
        onClick={() => {
          // "No, gracias" = skip + avanzar al resumen. Si no hay onSkip,
          // como mínimo deseleccionamos pastry para que el state quede limpio.
          if (onSkip) {
            onSelect(null)
            onSkip()
          } else {
            onSelect(null)
          }
        }}
        className="w-full rounded-2xl border border-brand-200/70 bg-white p-4 text-center font-medium text-brand-700 hover:border-brand-300 transition-all"
      >
        {locale === "es" ? "No, gracias" : "No, thanks"}
      </button>
    </div>
  )
}
