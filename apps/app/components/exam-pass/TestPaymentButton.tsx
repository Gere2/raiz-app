"use client"

/**
 * Botón secundario "Modo test" para simular un pago sin Stripe.
 *
 * Renderiza SOLO si `NEXT_PUBLIC_ENABLE_EXAM_PASS_TEST_MODE === "true"` en el
 * cliente. La protección real está en Brain (servidor): aunque alguien
 * forzara la flag del cliente, los endpoints test/* devuelven 404 si la
 * env var del servidor no está activa.
 *
 * Visualmente diferenciado: borde dashed amber, prefijo "Modo test —".
 */

import { useState } from "react"
import { TestTube2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { isExamPassTestModeEnabled } from "@/lib/exam-pass"

interface TestPaymentButtonProps {
  /** Etiqueta del botón ("Simular pago del bono", etc.). */
  label: string
  /** Texto auxiliar bajo el botón explicando qué hace. */
  helperText?: string
  /** Función que ejecuta la simulación; debe devolver `{ ok }` o lanzar. */
  onSimulate: () => Promise<{ ok: true } | { ok: false; error: string }>
  /** Callback cuando la simulación termina con éxito. */
  onSuccess?: () => void
  /** Callback cuando hay error; recibe el código. */
  onError?: (error: string) => void
}

export function TestPaymentButton({
  label,
  helperText,
  onSimulate,
  onSuccess,
  onError,
}: TestPaymentButtonProps) {
  const { locale } = useLanguage()
  const [busy, setBusy] = useState(false)

  if (!isExamPassTestModeEnabled()) return null

  async function handleClick() {
    setBusy(true)
    try {
      const res = await onSimulate()
      if (res.ok) {
        onSuccess?.()
      } else {
        onError?.(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
        <TestTube2 className="h-3.5 w-3.5" />
        <span>
          {locale === "es"
            ? "Modo test — no usar en producción"
            : "Test mode — do not use in production"}
        </span>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="w-full rounded-xl bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? locale === "es"
            ? "Simulando…"
            : "Simulating…"
          : label}
      </button>
      {helperText && (
        <p className="text-xs text-amber-700">{helperText}</p>
      )}
    </div>
  )
}
