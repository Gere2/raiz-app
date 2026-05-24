"use client"

/**
 * MissionCard — Tarjeta de misión con progreso visual.
 * Soporta estados: active, locked, completed.
 */

import type { Mission, MissionStatus } from "@/lib/gamification/types"
import { Target, Lock, CheckCircle, Coffee } from "lucide-react"

interface MissionCardProps {
  mission: Mission
  status: MissionStatus
  progress: number
  total: number
  locale?: "es" | "en"
}

export function MissionCard({
  mission,
  status,
  progress,
  total,
  locale = "es",
}: MissionCardProps) {
  const title = locale === "en" ? mission.titleEn : mission.title
  const desc = locale === "en" ? mission.descriptionEn : mission.description
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0

  const isLocked = status === "locked"
  const isCompleted = status === "completed"

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        isLocked
          ? "border-brand-100 bg-brand-50/50 opacity-60"
          : isCompleted
            ? "border-leaf-200 bg-leaf-50/50"
            : "border-brand-200/70 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isLocked ? "bg-brand-100" : isCompleted ? "bg-leaf-100" : "bg-brand-50"
          }`}
        >
          {isLocked ? (
            <Lock className="h-4 w-4 text-brand-300" />
          ) : isCompleted ? (
            <CheckCircle className="h-5 w-5 text-leaf-600" />
          ) : (
            <Target className="h-5 w-5 text-brand-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-sm font-semibold truncate ${
                isCompleted ? "text-leaf-700" : "text-brand-900"
              }`}
              title={title}
            >
              {title}
            </p>
            <span
              className={`shrink-0 text-xs font-medium tabular-nums flex items-center gap-1 ${
                isCompleted ? "text-leaf-600" : "text-brand-500"
              }`}
            >
              <Coffee className="h-3.5 w-3.5 flex-shrink-0" />
              +{mission.reward}
            </span>
          </div>

          <p className="text-xs text-brand-400 mt-0.5 line-clamp-2">{desc}</p>

          {/* Barra de progreso (solo si active) */}
          {status === "active" && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-brand-500">
                  {progress}/{total}
                </span>
                <span className="text-[10px] text-brand-400">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-brand-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-leaf-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Estado completado */}
          {isCompleted && (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-[10px] font-medium text-leaf-600">
                {locale === "en" ? "Completed" : "Completada"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
