"use client"

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react"
import { translations, type Locale } from "@/lib/i18n/translations"

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en")

  // Load saved language on mount
  useEffect(() => {
    try {
      // Guard against SSR — localStorage is only available in the browser
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem("raiz-locale") as Locale | null
        if (saved === "es" || saved === "en") {
          setLocaleState(saved)
        }
      }
    } catch {}
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      // Guard against SSR — localStorage is only available in the browser
      if (typeof window !== "undefined") {
        window.localStorage.setItem("raiz-locale", newLocale)
      }
    } catch {}
  }, [])

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] ?? translations["en"]?.[key] ?? key
    },
    [locale]
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
