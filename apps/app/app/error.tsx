"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useLanguage } from "@/components/language-provider"

/**
 * Error boundary global del app.
 * Next.js 13+ — se activa cuando una página lanza una excepción no capturada.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  let t: (key: string) => string | undefined = () => undefined
  try {
    const lang = useLanguage()
    t = lang.t
  } catch {
    // LanguageProvider crashed, use fallback Spanish strings
  }

  useEffect(() => {
    // Loguear el error (en producción, conectar a Sentry u otro servicio)
    console.error("[App Error]", error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center animate-fade-up">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-50 border border-red-200">
        <span className="text-5xl">☕</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-brand-900">
          {t("error.title") || "Algo salió mal"}
        </h1>
        <p className="mt-2 text-sm text-brand-500 max-w-xs mx-auto">
          {t("error.subtitle") || "Parece que encontramos un error. Intenta de nuevo."}
        </p>
        {error?.digest && (
          <p className="mt-1 text-[11px] font-mono text-brand-300">
            ref: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={reset}
          className="w-full rounded-2xl bg-leaf-600 py-3.5 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] transition-all shadow-lg shadow-leaf-600/20"
        >
          {t("error.retry") || "Reintentar"}
        </button>
        <Link
          href="/"
          className="w-full rounded-2xl border border-brand-200 py-3 text-center text-sm font-medium text-brand-600 hover:bg-brand-100 transition-all"
        >
          {t("error.back") || "Volver al inicio"}
        </Link>
      </div>
    </div>
  )
}
