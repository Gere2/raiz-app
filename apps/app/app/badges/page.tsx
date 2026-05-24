"use client"

import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { useGamification } from "@/hooks/use-gamification"
import Link from "next/link"
import { BADGES } from "@/lib/gamification/constants"
import { Trophy, Target, RefreshCw, BookOpen, Leaf, Heart, Zap, Award, Check, Lock, ArrowLeft } from "@/lib/icons"

// Badge rarity color constants
const BADGE_RARITY_COLORS = {
  legendary: { border: "border-amber-200", bg: "bg-amber-50", icon: "text-amber-600" },
  epic: { border: "border-purple-200", bg: "bg-purple-50", icon: "text-purple-600" },
  rare: { border: "border-blue-200", bg: "bg-blue-50", icon: "text-blue-600" },
  common: { border: "border-brand-200", bg: "bg-brand-50", icon: "text-brand-600" },
}

export default function BadgesPage() {
  const { user } = useAuth()
  const { locale, t } = useLanguage()
  const { state, loading } = useGamification()
  const isEn = locale === "en"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-100">
          <Trophy className="h-8 w-8 text-brand-500" />
        </div>
        <p className="text-brand-500">{t("profile.notsignedin")}</p>
        <Link href="/login" className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white">
          {t("profile.signin")}
        </Link>
      </div>
    )
  }

  const unlockedIds = state?.unlockedBadges ?? []
  const totalBadges = BADGES.length
  const unlockedCount = unlockedIds.length

  // Agrupar por categoría
  const categories = [
    { id: "exploration", label: isEn ? "Exploration" : "Exploración", icon: Target },
    { id: "recurrence", label: isEn ? "Recurrence" : "Recurrencia", icon: RefreshCw },
    { id: "knowledge", label: isEn ? "Knowledge" : "Conocimiento", icon: BookOpen },
    { id: "sustainability", label: isEn ? "Sustainability" : "Sostenibilidad", icon: Leaf },
    { id: "community", label: isEn ? "Community" : "Comunidad", icon: Heart },
    { id: "speed", label: isEn ? "Speed" : "Velocidad", icon: Zap },
  ] as const

  return (
    <div className="space-y-5 animate-fade-up pb-8">
      {/* Header */}
      <div>
        <Link href="/profile" className="text-xs text-brand-400 hover:text-brand-600 flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5 inline" />
          {isEn ? "Profile" : "Perfil"}
        </Link>
        <h1 className="text-xl font-bold text-brand-900 mt-1">
          {t("gam.badges")}
        </h1>
        <p className="text-sm text-brand-400 mt-0.5">
          {unlockedCount}/{totalBadges} {t("gam.badges.unlocked")}
        </p>
      </div>

      {/* Progress bar general */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-brand-300">
            {isEn ? "Collection" : "Colección"}
          </p>
          <p className="text-sm font-bold">
            {Math.round((unlockedCount / totalBadges) * 100)}%
          </p>
        </div>
        <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-leaf-400 transition-all duration-700"
            style={{ width: `${(unlockedCount / totalBadges) * 100}%` }}
          />
        </div>
      </div>

      {/* Badges por categoría */}
      {categories.map(cat => {
        const badgesInCategory = BADGES.filter(b => b.category === cat.id)
        if (badgesInCategory.length === 0) return null
        const unlockedInCat = badgesInCategory.filter(b => unlockedIds.includes(b.id)).length

        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-2.5">
              <cat.icon className="h-4.5 w-4.5 text-brand-500" />
              <p className="text-sm font-semibold text-brand-900">{cat.label}</p>
              <span className="text-[10px] text-brand-400">
                {unlockedInCat}/{badgesInCategory.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {badgesInCategory.map(badge => {
                const isUnlocked = unlockedIds.includes(badge.id)
                const rarityKey = badge.rarity as keyof typeof BADGE_RARITY_COLORS || "common"
                const colors = BADGE_RARITY_COLORS[rarityKey]
                const rarityColor = `${colors.border} ${colors.bg}`

                return (
                  <div
                    key={badge.id}
                    aria-label={isUnlocked ? (isEn ? badge.nameEn : badge.name) : (isEn ? `${badge.nameEn} - Locked` : `${badge.name} - Bloqueada`)}
                    aria-disabled={!isUnlocked}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                      isUnlocked
                        ? rarityColor
                        : "border-brand-100 bg-brand-50/30 opacity-40 grayscale"
                    }`}
                  >
                    {isUnlocked ? (
                      <Award className={`h-6 w-6 ${colors.icon}`} />
                    ) : (
                      <Lock className="h-6 w-6 text-brand-300" />
                    )}
                    <span className="text-[10px] font-medium text-brand-700 text-center leading-tight line-clamp-2">
                      {isEn ? badge.nameEn : badge.name}
                    </span>
                    {isUnlocked && (
                      <Check className="h-3 w-3 text-leaf-600" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
