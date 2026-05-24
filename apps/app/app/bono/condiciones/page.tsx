"use client"

/**
 * /bono/condiciones — Condiciones completas del Bono Supervivencia Exámenes.
 *
 * Texto legal-amigable. No conecta con engine ni hook: es contenido estático
 * traducido en cliente con `useLanguage`.
 */

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  EXAM_PASS_PRICING,
  EXAM_PASS_RULES,
  type Locale,
} from "@/lib/exam-pass"

export default function CondicionesPage() {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  const items = locale === "es" ? ITEMS_ES : ITEMS_EN

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <Link
        href="/bono"
        className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {locale === "es" ? "Volver" : "Back"}
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-brand-900">
          {locale === "es"
            ? "Condiciones del Bono Supervivencia Exámenes"
            : "Exam Survival Pass conditions"}
        </h1>
      </header>

      <div className="rounded-2xl border border-brand-200/70 bg-white p-5">
        <ul className="space-y-3 text-sm leading-relaxed text-brand-700">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="select-none text-brand-300">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-brand-400">
        {locale === "es"
          ? `Validez ${EXAM_PASS_RULES.VALIDITY_DAYS} días. Precio early-bird ${EXAM_PASS_PRICING.EARLY_BIRD_PRICE} € (primeros ${EXAM_PASS_PRICING.EARLY_BIRD_LIMIT}); después ${EXAM_PASS_PRICING.STANDARD_PRICE} €.`
          : `Valid ${EXAM_PASS_RULES.VALIDITY_DAYS} days. Early-bird ${EXAM_PASS_PRICING.EARLY_BIRD_PRICE} € (first ${EXAM_PASS_PRICING.EARLY_BIRD_LIMIT}); after that ${EXAM_PASS_PRICING.STANDARD_PRICE} €.`}
      </p>
    </main>
  )
}

const ITEMS_ES = [
  "El bono incluye 10 créditos.",
  "Cada crédito equivale a 1 bebida base.",
  "Bebidas base incluidas: café solo, americano, cortado y café con leche.",
  "Matcha, chai, bebidas iced, leches vegetales, extra shot, tamaño grande y repostería tienen suplemento.",
  "Cada bebida canjeada consume 1 crédito, aunque tenga suplemento.",
  "Los suplementos se pagan en el momento de hacer el pedido.",
  "Válido durante 60 días desde la compra.",
  "No acumulable con otras promociones.",
  "No reembolsable una vez utilizado parcialmente.",
]

const ITEMS_EN = [
  "The pass includes 10 credits.",
  "Each credit equals 1 base drink.",
  "Base drinks included: espresso, americano, cortado and coffee with milk.",
  "Matcha, chai, iced drinks, plant milks, extra shot, large size and pastries have an extra charge.",
  "Each drink redeemed uses 1 credit, even when an extra charge applies.",
  "Extras are paid at the time of order.",
  "Valid for 60 days from purchase.",
  "Not combinable with other promotions.",
  "Not refundable once partially used.",
]
