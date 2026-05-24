"use client"

/**
 * GranosCounter — Contador de granos (moneda) con animación.
 * Para header y secciones donde se muestra el saldo.
 */

import { CURRENCY_NAME, CURRENCY_NAME_EN } from "@/lib/gamification/constants"
import { Coffee } from "lucide-react"

interface GranosCounterProps {
  granos: number
  locale?: "es" | "en"
  variant?: "compact" | "full"
}

export function GranosCounter({
  granos,
  locale = "es",
  variant = "full",
}: GranosCounterProps) {
  const currencyName = locale === "en" ? CURRENCY_NAME_EN : CURRENCY_NAME

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <Coffee className="h-4 w-4 text-leaf-600" />
        <span className="text-sm font-bold text-brand-800 tabular-nums">
          {granos.toLocaleString()}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-brand-50 border border-brand-200/50 px-3 py-2">
      <Coffee className="h-5 w-5 text-leaf-600" />
      <div>
        <p className="text-base font-bold text-brand-900 tabular-nums leading-tight">
          {granos.toLocaleString()}
        </p>
        <p className="text-[10px] text-brand-400 uppercase tracking-wider">
          {currencyName}
        </p>
      </div>
    </div>
  )
}
