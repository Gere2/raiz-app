"use client"

/**
 * BadgeGrid — Grid de badges con estados locked/unlocked.
 * Muestra todos los badges disponibles; los no desbloqueados aparecen atenuados.
 */

import { useState } from "react"
import { BADGES } from "@/lib/gamification/constants"
import type { Badge } from "@/lib/gamification/types"
import { Award, Check } from "lucide-react"

interface BadgeGridProps {
  unlockedBadgeIds: string[]
  locale?: "es" | "en"
  /** Si true, muestra solo desbloqueados */
  unlockedOnly?: boolean
  /** Máximo de badges a mostrar (para dashboard compacto) */
  limit?: number
}

const rarityColors: Record<string, string> = {
  common: "border-brand-200 bg-brand-50",
  rare: "border-blue-200 bg-blue-50",
  epic: "border-purple-200 bg-purple-50",
  legendary: "border-amber-200 bg-amber-50",
}

const rarityLabels: Record<string, { es: string; en: string }> = {
  common: { es: "Común", en: "Common" },
  rare: { es: "Raro", en: "Rare" },
  epic: { es: "Épico", en: "Epic" },
  legendary: { es: "Legendario", en: "Legendary" },
}

export function BadgeGrid({
  unlockedBadgeIds,
  locale = "es",
  unlockedOnly = false,
  limit,
}: BadgeGridProps) {
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null)
  const unlocked = new Set(unlockedBadgeIds)

  let badges = unlockedOnly
    ? BADGES.filter(b => unlocked.has(b.id))
    : BADGES

  if (limit) badges = badges.slice(0, limit)

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        {badges.map((badge) => {
          const isUnlocked = unlocked.has(badge.id)
          return (
            <button
              key={badge.id}
              onClick={() => setSelectedBadge(badge)}
              aria-label={`${locale === "en" ? badge.nameEn : badge.name} — ${isUnlocked ? (locale === "en" ? "Unlocked" : "Desbloqueado") : (locale === "en" ? "Locked" : "Bloqueado")}`}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 transition-all active:scale-95 ${
                isUnlocked
                  ? rarityColors[badge.rarity]
                  : "border-brand-100 bg-brand-100/30 opacity-50"
              }`}
            >
              <div className="relative">
                <Award className="h-6 w-6 text-brand-600" />
                {isUnlocked && (
                  <Check className="absolute -bottom-1 -right-1 h-3 w-3 bg-white rounded-full text-leaf-600" />
                )}
              </div>
              <span className="text-[10px] font-medium text-brand-700 text-center leading-tight line-clamp-2">
                {locale === "en" ? badge.nameEn : badge.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Badge detail modal */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-up"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-200" />

            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50">
                <Award className="h-7 w-7 text-brand-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-brand-900">
                  {locale === "en" ? selectedBadge.nameEn : selectedBadge.name}
                </p>
                <p className={`text-xs font-medium mt-0.5 ${
                  selectedBadge.rarity === "legendary" ? "text-amber-600"
                    : selectedBadge.rarity === "epic" ? "text-purple-600"
                      : selectedBadge.rarity === "rare" ? "text-blue-600"
                        : "text-brand-400"
                }`}>
                  {rarityLabels[selectedBadge.rarity]?.[locale] || selectedBadge.rarity}
                </p>
              </div>

              <p className="text-sm text-brand-600">
                {locale === "en" ? selectedBadge.descriptionEn : selectedBadge.description}
              </p>

              {unlocked.has(selectedBadge.id) ? (
                <p className="text-sm text-leaf-600 font-medium italic">
                  {locale === "en" ? selectedBadge.celebrationEn : selectedBadge.celebration}
                </p>
              ) : (
                <div className="rounded-xl bg-brand-50 px-4 py-2.5">
                  <p className="text-xs text-brand-500">
                    {locale === "en"
                      ? selectedBadge.unlockCriteriaEn
                      : selectedBadge.unlockCriteria}
                  </p>
                </div>
              )}

              {selectedBadge.bonusReward > 0 && (
                <p className="text-xs text-brand-400">
                  +{selectedBadge.bonusReward} {locale === "en" ? "beans on unlock" : "granos al desbloquear"}
                </p>
              )}
            </div>

            <button
              onClick={() => setSelectedBadge(null)}
              className="mt-5 w-full rounded-2xl bg-brand-100 py-3 text-sm font-medium text-brand-700 active:scale-[0.98] transition-colors hover:bg-brand-200"
            >
              {locale === "en" ? "Close" : "Cerrar"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
