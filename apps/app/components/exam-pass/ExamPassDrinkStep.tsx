"use client"

/**
 * Paso 1 — elige bebida.
 *
 * Dos secciones: incluidas (1 crédito) y favoritas con suplemento. Cada card
 * muestra su label generado por `format.ts` — nunca a mano.
 */

import { Check } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  INCLUDED_PRODUCTS,
  PREMIUM_PRODUCTS,
  formatCreditPlusSupplement,
  formatUsesOneCredit,
  type Locale,
  type ProductId,
} from "@/lib/exam-pass"

interface ExamPassDrinkStepProps {
  selectedProductId?: ProductId
  onSelect: (id: ProductId) => void
}

export function ExamPassDrinkStep({
  selectedProductId,
  onSelect,
}: ExamPassDrinkStepProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-brand-900">
          {locale === "es" ? "¿Qué quieres tomar hoy?" : "What would you like today?"}
        </h2>
        <p className="text-sm text-brand-500">
          {locale === "es"
            ? "Todas las opciones usan 1 crédito del bono. Algunas tienen suplemento."
            : "All options use 1 credit. Some have an extra charge."}
        </p>
      </header>

      <Section
        title={
          locale === "es" ? "Incluidas con 1 crédito" : "Included with 1 credit"
        }
      >
        {INCLUDED_PRODUCTS.map((p) => (
          <DrinkCard
            key={p.id}
            id={p.id}
            name={locale === "es" ? p.name : p.nameEn}
            label={formatUsesOneCredit(locale)}
            selected={selectedProductId === p.id}
            onSelect={onSelect}
          />
        ))}
      </Section>

      <Section
        title={
          locale === "es" ? "Favoritas con suplemento" : "Favorites with extra"
        }
      >
        {PREMIUM_PRODUCTS.map((p) => (
          <DrinkCard
            key={p.id}
            id={p.id}
            name={locale === "es" ? p.name : p.nameEn}
            label={formatCreditPlusSupplement(p.supplement, locale)}
            selected={selectedProductId === p.id}
            onSelect={onSelect}
          />
        ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-brand-500">
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

interface DrinkCardProps {
  id: ProductId
  name: string
  label: string
  selected: boolean
  onSelect: (id: ProductId) => void
}

function DrinkCard({ id, name, label, selected, onSelect }: DrinkCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
        selected
          ? "border-leaf-500 bg-leaf-50 shadow-sm"
          : "border-brand-200/70 bg-white hover:border-brand-300"
      }`}
      aria-pressed={selected}
    >
      <div>
        <div className="font-semibold text-brand-900">{name}</div>
        <div className="text-sm text-brand-500">{label}</div>
      </div>
      {selected && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-600 text-white">
          <Check className="h-4 w-4" />
        </div>
      )}
    </button>
  )
}
