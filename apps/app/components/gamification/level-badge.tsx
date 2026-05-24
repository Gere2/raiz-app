"use client"

/**
 * LevelBadge — Muestra nivel actual con progreso visual.
 * Compacto para header/perfil, expandible para dashboard.
 */

import type { Level } from "@/lib/gamification/types"
import { CURRENCY_NAME, CURRENCY_NAME_EN } from "@/lib/gamification/constants"
import { Award } from "lucide-react"

interface LevelBadgeProps {
  level: Level
  progress: number // 0-100
  totalGranos: number
  granosToNext: number
  locale?: "es" | "en"
  /** "compact" para header, "full" para dashboard */
  variant?: "compact" | "full"
}

export function LevelBadge({
  level,
  progress,
  totalGranos,
  granosToNext,
  locale = "es",
  variant = "full",
}: LevelBadgeProps) {
  const name = locale === "en" ? level.nameEn : level.name
  const tagline = locale === "en" ? level.taglineEn : level.tagline
  const currencyName = locale === "en" ? CURRENCY_NAME_EN : CURRENCY_NAME

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-leaf-600" />
        <span className="text-sm font-semibold text-brand-800">{name}</span>
        <div className="h-1.5 w-16 rounded-full bg-brand-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-leaf-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white p-5">
      {/* Header: icon + nivel + tagline */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
          <Award className="h-6 w-6 text-leaf-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-brand-900">{name}</p>
          <p className="text-xs text-brand-400 truncate">{tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-leaf-700 tabular-nums">
            {totalGranos.toLocaleString()}
          </p>
          <p className="text-[10px] text-brand-400 uppercase tracking-wider">
            {currencyName}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="relative">
        <div className="h-2.5 w-full rounded-full bg-brand-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-leaf-500 to-leaf-400 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {granosToNext > 0 && (
          <p className="mt-1.5 text-[11px] text-brand-400 text-right">
            {locale === "en"
              ? `${granosToNext.toLocaleString()} beans to next level`
              : `${granosToNext.toLocaleString()} granos para el siguiente nivel`}
          </p>
        )}
        {granosToNext === 0 && (
          <p className="mt-1.5 text-[11px] text-leaf-600 text-right font-medium">
            {locale === "en" ? "Max level reached!" : "¡Nivel máximo alcanzado!"}
          </p>
        )}
      </div>
    </div>
  )
}
