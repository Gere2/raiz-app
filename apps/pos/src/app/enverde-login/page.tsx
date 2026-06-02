"use client"

/**
 * /enverde-login  (POS — bridge de identidad enverde)
 *
 * Página puente a la que se redirige a un café enverde para entrar al POS.
 * Canjea el custom token (firmado por el brain para uid=enverde_<orgId>) por una
 * sesión Firebase de raizygrano y siembra el cafeUser de SimpleAuth, de modo que
 * el café entra autenticado y operando como SU org (useOrg → orgId → subcolección).
 *
 * Análogo al /enverde-login del brain, pero el POS tiene doble capa de auth
 * (Firebase + SimpleAuth), así que usamos signInWithToken para poblar ambas.
 */
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSimpleAuth } from "@/contexts/simple-auth-context"

function EnverdeLoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { signInWithToken } = useSimpleAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get("token")
    const rawNext = params.get("next") || "/pos"
    // Anti open-redirect: solo rutas internas.
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pos"

    if (!token) {
      setError("Falta el token de acceso. Vuelve a abrir el TPV desde tu panel.")
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        await signInWithToken(token)
        if (!cancelled) router.replace(next)
      } catch (e) {
        console.error("enverde-login (POS) error", e)
        if (!cancelled) {
          setError(
            "No pudimos iniciar tu sesión. El enlace puede haber caducado — vuelve a abrir el TPV desde tu panel."
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params, router, signInWithToken])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f0e9d2] p-6 text-center">
      {error ? (
        <>
          <p className="text-lg font-medium text-red-600">{error}</p>
          <a href="https://enverde.app" className="text-sm underline">
            Volver a enverde
          </a>
        </>
      ) : (
        <>
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800"
            aria-hidden
          />
          <p className="text-base text-gray-600">Preparando tu TPV…</p>
        </>
      )}
    </main>
  )
}

export default function EnverdeLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f0e9d2]">
          <p className="text-gray-600">Cargando…</p>
        </main>
      }
    >
      <EnverdeLoginInner />
    </Suspense>
  )
}
