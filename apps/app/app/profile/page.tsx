"use client"

import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { useGamification } from "@/hooks/use-gamification"
import { auth } from "@/lib/firebase"
import { signOut } from "firebase/auth"
import { useRouter } from "next/navigation"
import Link from "next/link"
import PointsCard from "./PointsCard"
import {
  LevelBadge,
  MissionCard,
  BadgeGrid,
  StreakIndicator,
  GranosCounter,
} from "@/components/gamification"
import { getActiveMissions } from "@/lib/gamification/engine"
import { BookOpen, Gift, ClipboardList, User, LogOut } from "lucide-react"

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const { locale, t } = useLanguage()
  const router = useRouter()
  const { state, raw, numericCode, loading: gamLoading } = useGamification()

  const loading = authLoading || gamLoading

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
        <User className="h-10 w-10 text-brand-300" />
        <p className="text-brand-500">{t("profile.notsignedin")}</p>
        <Link
          href="/login"
          className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white"
        >
          {t("profile.signin")}
        </Link>
      </div>
    )
  }

  const firstName = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || ""

  // Calcular misiones activas con datos reales de Firestore
  const activeMissions = state && raw
    ? getActiveMissions(state.completedMissions, {
        completedQuizzes: state.completedQuizzes,
        totalPurchases: raw.totalPurchases,
        uniqueProducts: raw.uniqueProducts,
        appOrders: raw.appOrders,
        weeklyStreak: state.streak.weeklyStreak,
      })
    : []

  return (
    <div className="space-y-4 animate-fade-up pb-8">
      {/* ── QR y código de lealtad (arriba del todo) ── */}
      <PointsCard
        granos={state?.granos ?? 0}
        numericCode={numericCode || undefined}
        loading={gamLoading}
        history={raw?.pointsHistory ?? []}
      />

      {/* ── Header con saludo y granos ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-brand-900 break-words">
            {t("gam.welcome")}, <span className="block sm:inline">{firstName}</span>
          </h1>
          <p className="text-xs text-brand-400 mt-0.5">{t("gam.dashboard")}</p>
        </div>
        {state && (
          <GranosCounter granos={state.granos} locale={locale} variant="compact" />
        )}
      </div>

      {/* ── Nivel y progreso ── */}
      {state && (
        <LevelBadge
          level={state.level}
          progress={state.levelProgress}
          totalGranos={state.totalGranos}
          granosToNext={state.granosToNextLevel}
          locale={locale}
        />
      )}

      {/* ── Racha semanal ── */}
      {state && (
        <StreakIndicator streak={state.streak} locale={locale} />
      )}

      {/* ── Misiones activas (top 3) ── */}
      {activeMissions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-brand-900">
              {t("gam.missions.active")}
            </p>
            <span className="text-[10px] text-brand-400">
              {activeMissions.filter(m => m.status === "active").length} {locale === "en" ? "active" : "activas"}
            </span>
          </div>
          <div className="space-y-2.5">
            {activeMissions.slice(0, 3).map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                status={m.status}
                progress={m.progress}
                total={m.total}
                locale={locale}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Badges (grid compacto) ── */}
      {state && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-brand-900">
              {t("gam.badges")}
            </p>
            <Link href="/badges" className="text-[10px] text-leaf-600 font-medium hover:text-leaf-700">
              {state.unlockedBadges.length} {t("gam.badges.unlocked")} · {t("gam.badges.all")} →
            </Link>
          </div>
          <BadgeGrid
            unlockedBadgeIds={state.unlockedBadges}
            locale={locale}
            limit={8}
          />
        </div>
      )}

      {/* ── Quick actions ── */}
      <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
        {t("gam.quickactions")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/earn"
          className="flex flex-col items-center gap-2 rounded-2xl border border-brand-200/70 bg-white p-4 hover:bg-leaf-50 hover:border-leaf-200 transition-all active:scale-[0.97]"
        >
          <BookOpen className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-bold text-brand-800">
            {t("gam.earn")}
          </span>
          <span className="text-[10px] text-brand-400">
            {t("gam.earn.sub")}
          </span>
        </Link>
        <Link
          href="/rewards"
          className="flex flex-col items-center gap-2 rounded-2xl border border-brand-200/70 bg-white p-4 hover:bg-leaf-50 hover:border-leaf-200 transition-all active:scale-[0.97]"
        >
          <Gift className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-bold text-brand-800">
            {t("gam.rewards")}
          </span>
          <span className="text-[10px] text-brand-400">
            {t("gam.rewards.sub")}
          </span>
        </Link>
      </div>

      {/* ── Perfil cafetero ── */}
      {state && state.coffeeProfile.traits.length > 0 && (
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3">
            {t("gam.profile.title")}
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {state.coffeeProfile.traits.map((trait) => (
              <span
                key={trait}
                className="rounded-full bg-brand-50 border border-brand-200/50 px-3 py-1 text-xs text-brand-700 capitalize"
              >
                {trait}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-brand-400">
              {t("gam.profile.knowledge")}:
            </span>
            <span className="text-xs font-medium text-leaf-700">
              {t(`gam.profile.knowledge.${state.coffeeProfile.coffeeKnowledge}`)}
            </span>
          </div>
        </div>
      )}

      {/* ── Pedidos ── */}
      <Link
        href="/orders"
        className="flex items-center justify-between rounded-2xl border border-brand-200/70 bg-white p-4 hover:bg-brand-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-medium text-brand-800">
            {t("profile.orders")}
          </span>
        </div>
        <span className="text-brand-300">→</span>
      </Link>

      {/* ── Info cuenta ── */}
      <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-900 text-brand-50 text-lg font-bold"
            aria-label={`Profile avatar for ${user.displayName || user.email}`}
            role="img"
          >
            {user.displayName?.[0]?.toUpperCase() ||
              user.email?.[0]?.toUpperCase() ||
              "?"}
          </div>
          <div>
            {user.displayName && (
              <p className="font-semibold text-brand-900">{user.displayName}</p>
            )}
            <p className="text-sm text-brand-500">{user.email}</p>
          </div>
        </div>
      </div>

      {/* ── Sign out ── */}
      <button
        onClick={async () => {
          await signOut(auth)
          router.push("/")
        }}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-brand-500 hover:text-brand-700 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        {t("profile.signout")}
      </button>
    </div>
  )
}
