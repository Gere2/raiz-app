"use client"

import { useState } from "react"
import { Gift, X, Check, Hash } from "lucide-react"
import type { User } from "firebase/auth"
import {
  validateRedemptionCode,
  useRedemption,
  type ValidateRedemptionResponse,
} from "@/lib/redemption-service"
import { translateLoyaltyError } from "@/lib/loyalty-errors"

interface RedemptionValidatorProps {
  user: User
  orgId: string
}

interface FoundRedemption {
  id: string
  rewardName: string
  pointsSpent: number
}

export function RedemptionValidator({ user, orgId }: RedemptionValidatorProps) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<FoundRedemption | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED") {
        return "No autorizado"
      }
      if (err.message === "FORBIDDEN") {
        return "No autorizado"
      }
      // Network error or other exception
      if (err.message.includes("HTTP")) {
        return "Error de conexión"
      }
    }
    return "Error al validar"
  }

  const handleLookup = async () => {
    if (code.length !== 6) return
    setLoading(true)
    setError(null)
    setFound(null)

    try {
      const result = await validateRedemptionCode(user, orgId, code)

      setLoading(false)

      if (result.valid) {
        setFound({
          id: result.redemption.id,
          rewardName: result.redemption.rewardName,
          pointsSpent: result.redemption.pointsSpent,
        })
      } else {
        // API returned explicit error - use translation helper
        setError(translateLoyaltyError(result.error || "INVALID_CODE"))
      }
    } catch (err) {
      setLoading(false)
      setError(getErrorMessage(err))
    }
  }

  const handleConfirm = async () => {
    if (!found?.id) return
    setLoading(true)

    try {
      const result = await useRedemption(user, orgId, found.id)

      setLoading(false)

      if (result.success) {
        setConfirmed(true)
      } else {
        // API returned explicit error - use translation helper
        setError(translateLoyaltyError(result.error || "INVALID_CODE"))
      }
    } catch (err) {
      setLoading(false)
      setError(getErrorMessage(err))
    }
  }

  const reset = () => {
    setCode("")
    setFound(null)
    setError(null)
    setConfirmed(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 hover:border-amber-400 hover:bg-amber-100 transition-all active:scale-[0.97]"
      >
        <Gift className="h-4 w-4" />
        Validar canje
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={reset} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Validar canje</h2>
          <button onClick={reset} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmed ? (
          <div className="text-center py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-3">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-bold text-green-800">Canje validado</p>
            <p className="text-sm text-green-600 mt-1">{found?.rewardName}</p>
            <button
              onClick={reset}
              className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white hover:bg-gray-800"
            >
              Cerrar
            </button>
          </div>
        ) : found ? (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
              <p className="text-sm font-bold text-amber-800">{found.rewardName}</p>
              <p className="text-xs text-amber-600 mt-1">{found.pointsSpent.toLocaleString()} pts canjeados</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Validando..." : "Confirmar entrega"}
            </button>
            <button
              onClick={() => { setFound(null); setCode(""); setError(null) }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Introduce el código de 6 caracteres del cliente:</p>
            <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="flex items-center pl-3">
                <Hash className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  setError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="ABC123"
                className="w-full px-3 py-3 text-center text-lg font-mono font-bold tracking-[0.3em] focus:outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <button
              onClick={handleLookup}
              disabled={code.length !== 6 || loading}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loading ? "Buscando..." : "Buscar código"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
