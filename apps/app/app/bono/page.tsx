"use client"

/**
 * /bono — Landing del Bono Supervivencia Exámenes.
 *
 * Accesible a CUALQUIER visitante (con o sin sesión). La `ExamPassCard`
 * decide qué pintar según el estado:
 *  - sin sesión           → tarjeta de venta (precio + CTA "Comprar bono").
 *  - logueado sin pass    → tarjeta de venta.
 *  - logueado con pending → "estamos confirmando tu pago".
 *  - logueado con active  → "Mi bono" + créditos + CTA "Pedir con mi bono".
 *
 * Los CTAs internos llevan a /bono/comprar y /bono/pedir, que hacen su
 * propio guard de sesión y redirigen a /login cuando hace falta.
 */

import Link from "next/link"
import { useLanguage } from "@/components/language-provider"
import { ExamPassCard } from "@/components/exam-pass/ExamPassCard"

export default function BonoPage() {
  const { locale } = useLanguage()

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">
          {locale === "es" ? "Bono Exámenes" : "Exam Pass"}
        </h1>
      </header>

      <ExamPassCard variant="full" />

      <div className="rounded-2xl bg-brand-50 p-4 space-y-2">
        <p className="text-sm font-medium text-brand-900">
          {locale === "es"
            ? "Tu bono cubre la bebida base. Si quieres hacerla más tuya, solo pagas el suplemento."
            : "Your pass covers the base drink. If you want to customise it, you only pay the extra."}
        </p>
        <Link
          href="/bono/condiciones"
          className="text-sm text-brand-500 hover:text-brand-700 underline"
        >
          {locale === "es" ? "Ver condiciones" : "View conditions"}
        </Link>
      </div>
    </main>
  )
}
