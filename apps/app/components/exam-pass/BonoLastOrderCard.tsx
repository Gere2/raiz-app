"use client"

/**
 * BonoLastOrderCard — atajo para repetir el último pedido del bono.
 *
 * Se monta en /bono cuando el usuario tiene pass activo Y existe una
 * redemption consumed previa. Muestra un resumen corto del último canje y
 * un botón que pre-rellena la URL del resumen del wizard:
 *   /bono/pedir/resumen?p=...&m=...&e=...&d=...
 *
 * Reutilizar el resumen del wizard (en lugar de canjear directamente desde
 * aquí) tiene dos ventajas:
 *  - El usuario ve el desglose y el coste antes de confirmar.
 *  - Si su último pedido tiene productos premium o suplementos, lo entiende
 *    en el mismo lenguaje que el wizard.
 *
 * Si el último pedido no es repetible (p.ej. dejó de existir el producto),
 * `computeOrder` en /resumen mostrará el error específico.
 */

import Link from "next/link"
import { Repeat } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  findExtra,
  findPastry,
  findProduct,
  type ExamPassRedemption,
  type Locale,
} from "@/lib/exam-pass"

interface BonoLastOrderCardProps {
  redemption: ExamPassRedemption
  /** True si el bono permite canjear ahora (créditos > 0). */
  canRedeem: boolean
}

export function BonoLastOrderCard({
  redemption,
  canRedeem,
}: BonoLastOrderCardProps) {
  const { locale: rawLocale } = useLanguage()
  const locale = rawLocale as Locale

  const summary = describeRedemption(redemption, locale)
  const href = buildResumenHref(redemption)

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-leaf-700" aria-hidden="true" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-brand-500">
          {locale === "es" ? "Repetir último pedido" : "Reorder last"}
        </h3>
      </div>

      <p className="text-sm text-brand-900">{summary}</p>

      {canRedeem ? (
        <Link
          href={href}
          className="block w-full rounded-xl bg-leaf-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-leaf-700 active:scale-[0.98]"
        >
          {locale === "es" ? "Repetir pedido" : "Reorder"}
        </Link>
      ) : (
        <p className="text-xs text-amber-700">
          {locale === "es"
            ? "Para repetir necesitas créditos disponibles en tu bono."
            : "To reorder you need available credits on your pass."}
        </p>
      )}
    </div>
  )
}

/**
 * Texto humano del último pedido. Usa nombres del catálogo local — los
 * productNames guardados en Firestore están en español; si el usuario está
 * en EN, traducimos vía `findProduct`.
 */
function describeRedemption(red: ExamPassRedemption, locale: Locale): string {
  const product = findProduct(red.productId)
  const productName = product
    ? locale === "es"
      ? product.name
      : product.nameEn
    : red.productName

  const parts: string[] = [productName]

  if (red.milkId) {
    // Las leches no necesitan localización pesada — mostramos solo si tiene
    // suplemento (la información relevante).
    if (red.milkId === "oat") parts.push(locale === "es" ? "avena" : "oat")
    else if (red.milkId === "almond") parts.push(locale === "es" ? "almendra" : "almond")
    else if (red.milkId === "lactose_free") parts.push(locale === "es" ? "sin lactosa" : "lactose-free")
  }

  for (const ex of red.extras ?? []) {
    const def = findExtra(ex)
    if (def) parts.push(locale === "es" ? def.name.toLowerCase() : def.nameEn.toLowerCase())
  }

  if (red.pastryId) {
    const p = findPastry(red.pastryId)
    if (p) parts.push(locale === "es" ? p.name.toLowerCase() : p.nameEn.toLowerCase())
  }

  return parts.join(" · ")
}

/**
 * Construye la URL del resumen del wizard pre-rellenada con los mismos
 * parámetros del último canje. Mismo formato que `wizard-state.ts` espera.
 */
function buildResumenHref(red: ExamPassRedemption): string {
  const params: string[] = [`p=${encodeURIComponent(red.productId)}`]
  if (red.milkId) params.push(`m=${encodeURIComponent(red.milkId)}`)
  if (red.extras && red.extras.length > 0) {
    params.push(`e=${encodeURIComponent(red.extras.join(","))}`)
  }
  if (red.pastryId) params.push(`d=${encodeURIComponent(red.pastryId)}`)
  return `/bono/pedir/resumen?${params.join("&")}`
}
