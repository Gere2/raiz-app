"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { getPointsBalance } from "@/lib/loyalty-points-service"
import {
  getRewardsCatalog,
  redeemReward,
  getActiveRedemptions,
  type Reward,
  type Redemption,
} from "@/lib/rewards-service"
import { Gift, Coffee, ArrowLeft } from "@/lib/icons"

import { toast } from "sonner"
import Link from "next/link"

export default function RewardsPage() {
  const { user, loading: authLoading } = useAuth()
  const { t, locale } = useLanguage()
  const isEn = locale === "en"
  const confirmationRef = useRef<HTMLDivElement>(null)

  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [activeRedemptions, setActiveRedemptions] = useState<Redemption[]>([])
  const [justRedeemed, setJustRedeemed] = useState<{ code: string; reward: Reward } | null>(null)
  const [catalog, setCatalog] = useState<Reward[]>([])

  useEffect(() => {
    // Esperar a que Firebase Auth termine de inicializar antes de hacer fetch
    if (authLoading) return
    if (!user?.uid) { setLoading(false); return }
    Promise.all([
      getPointsBalance(user.uid),
      getActiveRedemptions(user.uid),
      getRewardsCatalog(),
    ]).then(([balance, redemptions, rewards]) => {
      setPoints(balance.loyaltyPoints)
      setActiveRedemptions(redemptions)
      setCatalog(rewards)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user?.uid, authLoading])

  const handleRedeem = async (reward: Reward) => {
    if (!user?.uid || redeeming) return

    if (points < reward.pointsCost) {
      toast.error(isEn ? "Not enough beans" : "Granos insuficientes")
      return
    }

    setRedeeming(reward.id)
    const result = await redeemReward(user.uid, reward.id)
    setRedeeming(null)

    if (result.success && result.code) {
      setPoints(prev => prev - reward.pointsCost)
      setJustRedeemed({ code: result.code, reward })
      // Refresh active redemptions
      getActiveRedemptions(user.uid).then(setActiveRedemptions)
      // Scroll to confirmation section
      setTimeout(() => {
        confirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      // Celebrar badges nuevos
      if (result.newBadges && result.newBadges.length > 0) {
        (async () => {
          try {
            const { BADGES } = await import("@/lib/gamification/constants")
            for (const badgeId of result.newBadges!) {
              const badge = BADGES.find(b => b.id === badgeId)
              if (badge) {
                setTimeout(() => {
                  toast.success(
                    `${badge.emoji} ${isEn ? badge.celebrationEn : badge.celebration}`,
                    { duration: 5000 }
                  )
                }, 1500)
              }
            }
          } catch (err) {
            console.warn("Failed to load badges:", err)
          }
        })()
      }
    } else {
      toast.error(result.error || (isEn ? "Error redeeming" : "Error al canjear"))
    }
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <div className="h-20 w-20 rounded-full bg-brand-100 flex items-center justify-center">
          <Gift className="h-10 w-10 text-brand-500" />
        </div>
        <p className="text-brand-500">{t("profile.notsignedin")}</p>
        <Link href="/login" className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white">
          {t("profile.signin")}
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up pb-8">
      {/* Header */}
      <div>
        <Link href="/profile" className="text-xs text-brand-400 hover:text-brand-600 flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5 inline" />
          {t("rewards.back")}
        </Link>
        <h1 className="text-xl font-bold text-brand-900 mt-1">{t("rewards.title")}</h1>
      </div>

      {/* Points balance */}
      <div className="rounded-2xl bg-gradient-to-br from-leaf-600 to-leaf-700 p-5 text-white">
        <p className="text-xs uppercase tracking-wider text-leaf-200">{t("rewards.balance")}</p>
        <p className="text-3xl font-bold mt-1 flex items-center gap-2">
          {points.toLocaleString()}
          <Coffee className="h-5 w-5 text-leaf-200" />
        </p>
      </div>

      {/* Just redeemed modal */}
      {justRedeemed && (
        <div ref={confirmationRef} className="rounded-2xl border-2 border-green-400 bg-green-50 p-5 text-center">
          <div className="flex justify-center mb-2">
            <Gift className="h-10 w-10 text-green-600" />
          </div>
          <p className="text-sm font-bold text-green-800 mb-1">{t("rewards.redeemed")}</p>
          <p className="text-xs text-green-600 mb-3">{isEn ? justRedeemed.reward.nameEn : justRedeemed.reward.name}</p>
          <div className="bg-white rounded-xl px-6 py-3 inline-block">
            <p className="text-[10px] uppercase tracking-wider text-brand-400 mb-1">{t("rewards.showcode")}</p>
            <p className="text-2xl font-mono font-bold text-brand-900 tracking-[0.3em]">{justRedeemed.code}</p>
          </div>
          <p className="text-[11px] text-green-600 mt-3">{t("rewards.codeinfo")}</p>
          <p className="text-[10px] text-green-500 mt-1">
            {t("rewards.expires48h") || "Válido por 48 horas desde el canje"}
          </p>
          <button
            onClick={() => setJustRedeemed(null)}
            className="mt-3 text-xs text-green-700 underline"
          >
            {isEn ? "Close" : "Cerrar"}
          </button>
        </div>
      )}

      {/* Active redemptions */}
      {activeRedemptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">{t("rewards.active")}</p>
          <div className="space-y-2">
            {activeRedemptions.map(r => {
              const expiryDate = r.expiresAt
                ? new Date(r.expiresAt instanceof Date ? r.expiresAt : (r.expiresAt as { toDate?: () => Date })?.toDate?.() || new Date())
                : null
              const expiryLabel = expiryDate
                ? `${String(expiryDate.getDate()).padStart(2, '0')}/${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()} ${String(expiryDate.getHours()).padStart(2, '0')}:${String(expiryDate.getMinutes()).padStart(2, '0')}`
                : null
              return (
                <div key={r.id} className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 flex items-center gap-3">
                  <Gift className="h-6 w-6 text-amber-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-800 truncate">{r.rewardName}</p>
                    <p className="text-[10px] text-amber-600">{t("rewards.showbarista")}</p>
                    {expiryLabel && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        {t("rewards.validuntil") || "Válido hasta"}: {expiryLabel}
                      </p>
                    )}
                  </div>
                  <div className="bg-white rounded-lg px-3 py-1.5">
                    <p className="text-sm font-mono font-bold text-brand-900 tracking-wider">{r.code}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Rewards catalog */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3">{t("rewards.catalog")}</p>
        <div className="space-y-3">
          {catalog.map(reward => {
            const canAfford = points >= reward.pointsCost
            const isRedeeming = redeeming === reward.id
            return (
              <div
                key={reward.id}
                className={`rounded-2xl border bg-white p-4 transition-all ${
                  canAfford ? "border-brand-200/70" : "border-brand-100 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Gift className="h-8 w-8 text-brand-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-900">
                      {isEn ? reward.nameEn : reward.name}
                    </p>
                    <p className="text-xs text-brand-400 mt-0.5">
                      {isEn ? reward.descriptionEn : reward.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className={`text-sm font-bold flex items-center gap-1 ${canAfford ? "text-leaf-600" : "text-brand-300"}`}>
                      {reward.pointsCost.toLocaleString()}
                      <Coffee className="h-3.5 w-3.5 inline" />
                    </p>
                  </div>

                  {canAfford ? (
                    <button
                      onClick={() => handleRedeem(reward)}
                      disabled={isRedeeming || redeeming !== null}
                      className="rounded-xl bg-leaf-600 px-4 py-2 text-xs font-bold text-white hover:bg-leaf-700 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isRedeeming ? "..." : t("rewards.redeem")}
                    </button>
                  ) : (
                    <p className="text-[10px] text-brand-300 flex items-center gap-1">
                      {isEn ? `${(reward.pointsCost - points).toLocaleString()}` : `Faltan ${(reward.pointsCost - points).toLocaleString()}`}
                      <Coffee className="h-3.5 w-3.5 inline" />
                      {isEn ? "to go" : ""}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                {!canAfford && (
                  <div className="mt-2 h-1.5 rounded-full bg-brand-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-leaf-400 transition-all"
                      style={{ width: `${Math.min(100, (points / reward.pointsCost) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
