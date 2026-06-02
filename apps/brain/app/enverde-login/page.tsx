"use client";

/**
 * /enverde-login  (T1 — bridge de identidad)
 *
 * Página puente a la que enverde redirige tras provisionar. Canjea el custom
 * token (firmado por el brain para uid=enverde_<orgId>) por una sesión Firebase
 * de raizygrano vía signInWithCustomToken, y reenvía a `next` (la pantalla
 * "sube tu extracto → tu sueldo").
 *
 * Contrato: ../../ENVERDE-BRIDGE.md
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

function EnverdeLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    const rawNext = params.get("next") || "/";
    // Anti open-redirect: solo rutas internas.
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

    if (!token) {
      setError("Falta el token de acceso. Vuelve a escanear el QR.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await signInWithCustomToken(auth, token);
        if (!cancelled) router.replace(next);
      } catch (e) {
        console.error("enverde-login error", e);
        if (!cancelled) {
          setError(
            "No pudimos iniciar tu sesión. El enlace puede haber caducado — vuelve a escanear el QR."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="text-lg font-medium text-red-600">{error}</p>
          <a href="https://enverde.app/gratis" className="text-sm underline">
            Volver a enverde
          </a>
        </>
      ) : (
        <>
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800"
            aria-hidden
          />
          <p className="text-base text-gray-600">Preparando tu panel…</p>
        </>
      )}
    </main>
  );
}

export default function EnverdeLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">Cargando…</p>
        </main>
      }
    >
      <EnverdeLoginInner />
    </Suspense>
  );
}
