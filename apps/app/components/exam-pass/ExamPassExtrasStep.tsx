"use client"

/**
 * Paso 3 — extras (opcional, multi-selección).
 *
 * Recibe la lista de extras visibles desde el wrapper (que filtra
 * `iced_version` cuando la bebida ya es iced).
 */

import { useLanguage } from "@/components/language-provider"
import {
  formatPlusEuros,
  type ExtraDef,
  type ExtraId,
  type Locale,
} from "@/lib/exam-pass"

interface ExamPassExtrasStepProps {
  extras: ExtraId[]
  visibleOptions: readonly ExtraDef[]
  onToggle: (id: ExtraId) => void
}

export function ExamPassExtrasStep({
  extras,
  visibleOptions,
  onToggle,
}: ExamPassExtrasStepProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-brand-900">
          {locale === "es" ? "¿Quieres añadir algo más?" : "Anything extra?"}
        </h2>
        <p className="text-sm text-brand-500">
          {locale === "es"
            ? "Opcional. Puedes saltar este paso."
            : "Optional. You can skip this step."}
        </p>
      </header>

      <div className="grid gap-2">
        {visibleOptions.map((e) => {
          const checked = extras.includes(e.id)
          return (
            <label
              key={e.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                checked
                  ? "border-leaf-500 bg-leaf-50 shadow-sm"
                  : "border-brand-200/70 bg-white hover:border-brand-300"
              }`}
            >
              <div>
                <div className="font-semibold text-brand-900">
                  {locale === "es" ? e.name : e.nameEn}
                </div>
                <div className="text-sm text-brand-500">
                  {formatPlusEuros(e.supplement, locale)}
                </div>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-brand-300 text-leaf-600 focus:ring-leaf-500"
                checked={checked}
                onChange={() => onToggle(e.id)}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
