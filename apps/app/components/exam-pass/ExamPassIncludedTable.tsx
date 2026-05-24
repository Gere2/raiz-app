"use client"

/**
 * Bloques "¿Qué incluye tu bono?" — qué entra con 1 crédito, qué entra con
 * suplemento, leches, extras y dulces.
 *
 * Toda etiqueta sale por los helpers de `format.ts`. Regla crítica: las
 * bebidas premium muestran SIEMPRE "Usa 1 crédito + X €" — nunca "+X €" suelto.
 *
 * Las leches vegetales llevan la nota "Este suplemento solo aplica al usar el
 * Bono Exámenes." y los dulces muestran precio bono + precio normal tachado.
 */

import { useLanguage } from "@/components/language-provider"
import {
  EXTRAS_OPTIONS,
  INCLUDED_PRODUCTS,
  MILK_OPTIONS,
  PASTRY_OPTIONS,
  PREMIUM_PRODUCTS,
  formatCreditPlusSupplement,
  formatEuros,
  formatIncluded,
  formatIncludedFem,
  formatPastryLabel,
  formatPlusEuros,
  formatUsesOneCredit,
  type Locale,
} from "@/lib/exam-pass"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold uppercase tracking-wide text-brand-500">
      {children}
    </h3>
  )
}

function Row({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div>
        <span className="text-sm font-medium text-brand-900">{label}</span>
        {hint && <span className="ml-2 text-xs text-brand-400">{hint}</span>}
      </div>
      <span className="text-sm text-brand-700">{value}</span>
    </div>
  )
}

export function ExamPassIncludedTable() {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  // Hay alguna leche con suplemento para decidir si mostramos la nota.
  const milkHasSupplement = MILK_OPTIONS.some((m) => m.supplement > 0)

  return (
    <div className="space-y-6">
      {/* Incluidas con 1 crédito */}
      <section className="space-y-2">
        <SectionTitle>
          {locale === "es" ? "Incluidas con 1 crédito" : "Included with 1 credit"}
        </SectionTitle>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
          {INCLUDED_PRODUCTS.map((p) => (
            <Row
              key={p.id}
              label={locale === "es" ? p.name : p.nameEn}
              value={formatUsesOneCredit(locale)}
            />
          ))}
        </div>
      </section>

      {/* Premium con suplemento */}
      <section className="space-y-2">
        <SectionTitle>
          {locale === "es" ? "Favoritas con suplemento" : "Favorites with extra"}
        </SectionTitle>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
          {PREMIUM_PRODUCTS.map((p) => (
            <Row
              key={p.id}
              label={locale === "es" ? p.name : p.nameEn}
              value={formatCreditPlusSupplement(p.supplement, locale)}
            />
          ))}
        </div>
      </section>

      {/* Leches */}
      <section className="space-y-2">
        <SectionTitle>{locale === "es" ? "Leches" : "Milks"}</SectionTitle>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
          {MILK_OPTIONS.map((m) => (
            <Row
              key={m.id}
              label={locale === "es" ? m.name : m.nameEn}
              value={
                m.supplement > 0
                  ? formatPlusEuros(m.supplement, locale)
                  : formatIncludedFem(locale)
              }
            />
          ))}
        </div>
        {milkHasSupplement && (
          <p className="text-xs italic text-brand-500">
            {locale === "es"
              ? "Este suplemento solo aplica al usar el Bono Exámenes."
              : "This extra charge only applies when using the Exam Pass."}
          </p>
        )}
      </section>

      {/* Extras */}
      <section className="space-y-2">
        <SectionTitle>{locale === "es" ? "Extras" : "Extras"}</SectionTitle>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
          {EXTRAS_OPTIONS.map((e) => (
            <Row
              key={e.id}
              label={locale === "es" ? e.name : e.nameEn}
              value={
                e.supplement > 0
                  ? formatPlusEuros(e.supplement, locale)
                  : formatIncluded(locale)
              }
            />
          ))}
        </div>
      </section>

      {/* Dulces */}
      <section className="space-y-2">
        <SectionTitle>{locale === "es" ? "Algo dulce" : "Something sweet"}</SectionTitle>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 divide-y divide-brand-100">
          {PASTRY_OPTIONS.map((p) => {
            const labels = formatPastryLabel(p.id, locale)
            return (
              <div
                key={p.id}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="text-sm font-medium text-brand-900">
                  {locale === "es" ? p.name : p.nameEn}
                </span>
                <div className="text-right">
                  <div className="text-sm text-brand-700">{labels.label}</div>
                  <div className="text-xs text-brand-400 line-through">
                    {labels.before}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/**
 * Variante compacta para la pantalla de compra: solo el "qué incluye con 1
 * crédito" sin tablas largas. Útil cuando la card de venta principal ya
 * compite por espacio con el CTA.
 */
export function ExamPassIncludedShort() {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale
  const names = INCLUDED_PRODUCTS.map((p) =>
    locale === "es" ? p.name : p.nameEn,
  )
  return (
    <p className="text-sm text-brand-700">
      {locale === "es" ? "Incluye: " : "Includes: "}
      {names.join(" · ")}
    </p>
  )
}

export { formatEuros }
