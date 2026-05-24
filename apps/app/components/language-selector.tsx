"use client"

import { useLanguage } from "@/components/language-provider"

export function LanguageSelector() {
  const { locale, setLocale } = useLanguage()

  const toggle = () => setLocale(locale === "en" ? "es" : "en")

  return (
    <button
      onClick={toggle}
      className="flex h-9 items-center gap-1.5 rounded-full bg-brand-100 px-2.5 text-sm font-medium transition-all hover:bg-brand-200 active:scale-95"
      title={locale === "en" ? "Cambiar a español" : "Switch to English"}
    >
      <span className="text-base leading-none">{locale === "en" ? "🇬🇧" : "🇪🇸"}</span>
      <span className="text-xs font-semibold text-brand-600 uppercase">{locale}</span>
    </button>
  )
}
