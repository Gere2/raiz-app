"use client"

/**
 * StreakIndicator — Muestra racha semanal y bonus activo.
 * Diseño tipo "flame" compacto para dashboard.
 */

import type { StreakData } from "@/lib/gamification/types"
import { getStreakBonus } from "@/lib/gamification/engine"
import { CURRENCY_NAME, CURRENCY_NAME_EN } from "@/lib/gamification/constants"
import { Flame } from "lucide-react"

interface StreakIndicatorProps {
  streak: StreakData
  locale?: "es" | "en"
  variant?: "compact" | "full"
}

export function StreakIndicator({
  streak,
  locale = "es",
  variant = "full",
}: StreakIndicatorProps) {
  const bonus = getStreakBonus(streak.weeklyStreak)
  const isActive = streak.currentStreak > 0

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <Flame
          className={`h-4 w-4 ${isActive ? "text-amber-500" : "text-brand-300 opacity-50"}`}
          fill={isActive ? "currentColor" : "none"}
        />
        <span className="text-xs font-semibold text-brand-700 tabular-nums">
          {streak.currentStreak}
        </span>
        {bonus > 0 && (
          <span className="text-[10px] text-leaf-600 font-medium">
            +{bonus}
          </span>
        )}
      </div>
    )
  }

  const currencyName = locale === "en" ? CURRENCY_NAME_EN : CURRENCY_NAME

  // Dots for weekly visualization (7 days)
  const dots = Array.from({ length: 7 }, (_, i) => i < streak.currentStreak % 7 || (streak.currentStreak >= 7 && streak.currentStreak % 7 === 0))

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame
            className={`h-5 w-5 ${isActive ? "text-amber-500" : "text-brand-300 opacity-50"}`}
            fill={isActive ? "currentColor" : "none"}
          />
          <div>
            <p className="text-sm font-semibold text-brand-900">
              {locale === "en" ? "Streak" : "Racha"}
            </p>
            <p className="text-[10px] text-brand-400">
              {locale === "en"
                ? `${streak.weeklyStreak} consecutive weeks`
                : `${streak.weeklyStreak} semanas consecutivas`}
            </p>
          </div>
        </div>

        {bonus > 0 && (
          <div className="rounded-xl bg-leaf-50 border border-leaf-200 px-2.5 py-1">
            <p className="text-xs font-semibold text-leaf-700">
              +{bonus} {currencyName}
            </p>
            <p className="text-[9px] text-leaf-500">
              {locale === "en" ? "weekly bonus" : "bonus semanal"}
            </p>
          </div>
        )}
      </div>

      {/* Day dots */}
      <div className="flex items-center gap-1.5">
        {["L", "M", "X", "J", "V", "S", "D"].map((day, i) => (
          <div key={day} className="flex flex-col items-center gap-1 flex-1">
            <div
              className={`h-2 w-2 rounded-full transition-all ${
                dots[i] ? "bg-leaf-500 scale-110" : "bg-brand-100"
              }`}
            />
            <span className="text-[9px] text-brand-300">{day}</span>
          </div>
        ))}
      </div>

      {/* Best streak */}
      {streak.bestStreak > 0 && (
        <p className="mt-2.5 text-[10px] text-brand-300 text-center">
          {locale === "en"
            ? `Best: ${streak.bestStreak} days`
            : `Mejor: ${streak.bestStreak} días`}
        </p>
      )}
    </div>
  )
}
