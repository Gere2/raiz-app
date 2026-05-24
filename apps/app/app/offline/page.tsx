"use client"

import { useEffect, useState } from "react"

/** Detecta el idioma preferido del navegador para la página offline
 *  (no podemos usar LanguageProvider aquí porque puede no estar disponible sin conexión) */
function getLocale(): "es" | "en" {
  if (typeof navigator === "undefined") return "es"
  const lang = navigator.language || "es"
  return lang.startsWith("en") ? "en" : "es"
}

const copy = {
  es: {
    title: "Sin conexión",
    subtitle: "Parece que no tienes conexión a internet. Comprueba tu red e inténtalo de nuevo.",
    retry: "Intentar de nuevo",
    restored: "✅ Conexión restaurada. Redirigiendo...",
  },
  en: {
    title: "No connection",
    subtitle: "It looks like you're offline. Check your internet connection and try again.",
    retry: "Try again",
    restored: "✅ Connection restored! Redirecting...",
  },
}

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false)
  // useState accepts a function as initializer (lazy initialization).
  // getLocale is called once on mount to determine the initial locale.
  const [locale] = useState<"es" | "en">(() => getLocale())

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      // Dar un momento para que el usuario vea el mensaje antes de redirigir
      setTimeout(() => { window.location.href = "/" }, 1500)
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const t = copy[locale]

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100">
        <span className="text-5xl">📡</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t.title}</h1>
        <p className="mt-2 text-sm text-brand-500 max-w-xs mx-auto">{t.subtitle}</p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="rounded-2xl bg-leaf-600 px-8 py-3 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] transition-all shadow-lg shadow-leaf-600/20"
      >
        {t.retry}
      </button>

      {isOnline && (
        <p className="text-xs text-green-600 font-medium animate-fade-up">{t.restored}</p>
      )}
    </div>
  )
}
