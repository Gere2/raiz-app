"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useLanguage } from "@/components/language-provider"
import { Coffee, Copy, Check, Smartphone, BookOpen, QrCode } from "lucide-react"

// QR code inline SVG generation (no external dependency)
function QRCodeSVG({ value, size = 180 }: { value: string; size?: number }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-xl"
      style={{ imageRendering: "pixelated" }}
    />
  )
}

interface PointsCardProps {
  /** Saldo actual de granos (desde gamification state) */
  granos?: number
  /** Código numérico para QR/identificación */
  numericCode?: string
  /** Historial reciente de transacciones */
  history?: Array<{ description: string; type: string; amount: number }>
  /** Si true, muestra skeleton */
  loading?: boolean
}

export default function PointsCard({
  granos = 0,
  numericCode = "0000",
  history = [],
  loading = false,
}: PointsCardProps) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(numericCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-brand-200/70 bg-white p-5 animate-pulse">
        <div className="h-20 bg-brand-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Points balance card */}
      <div className="rounded-2xl border border-brand-200/70 bg-gradient-to-br from-leaf-50 to-white p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-leaf-600">
            {t("loyalty.title")}
          </span>
          <span className="text-[10px] text-brand-400">
            1€ = 100 <Coffee className="h-3 w-3 inline" />
          </span>
        </div>

        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Coffee className="h-5 w-5 text-leaf-600" />
            <p className="text-4xl font-bold text-brand-900">
              {granos.toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-brand-400">{t("loyalty.points")}</p>
        </div>

        {/* QR Button */}
        <button
          onClick={() => setShowQR(!showQR)}
          className="w-full rounded-xl bg-brand-900 py-3 text-sm font-semibold text-white hover:bg-brand-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <QrCode className="h-4 w-4" />
          {showQR ? t("loyalty.hideqr") : t("loyalty.showqr")}
        </button>
      </div>

      {/* QR Code expanded */}
      {showQR && user?.uid && (
        <div className="rounded-2xl border border-brand-200/70 bg-white p-5">
          <div className="flex flex-col items-center gap-4">
            <QRCodeSVG value={user.uid} size={180} />

            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-brand-400 mb-1">
                {t("loyalty.code")}
              </p>
              <button
                onClick={copyCode}
                className="flex items-center gap-2 rounded-xl bg-brand-100 px-5 py-2.5 font-mono text-2xl font-bold text-brand-900 tracking-[0.3em] hover:bg-brand-200 transition-colors"
              >
                {numericCode}
                {copied ? (
                  <Check className="h-4 w-4 text-leaf-600 font-sans font-normal" />
                ) : (
                  <Copy className="h-4 w-4 text-brand-400 font-sans font-normal" />
                )}
              </button>
            </div>

            <p className="text-[11px] text-brand-400 text-center leading-relaxed">
              {t("loyalty.scaninfo")}
            </p>
          </div>
        </div>
      )}

      {/* Recent history */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3">
            {t("loyalty.history")}
          </p>
          <div className="space-y-2">
            {history.slice(-5).reverse().map((tx, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-start gap-2 flex-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 flex-shrink-0 mt-0.5">
                    {tx.type === "APP" ? (
                      <Smartphone className="h-3.5 w-3.5 text-brand-600" />
                    ) : tx.type === "QUIZ" ? (
                      <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                    ) : (
                      <Coffee className="h-3.5 w-3.5 text-brand-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-brand-800 font-medium">{tx.description}</p>
                    <p className="text-[10px] text-brand-400">
                      {tx.type === "APP" ? "App" : tx.type === "QUIZ" ? "Quiz" : "Cafetería"}
                    </p>
                  </div>
                </div>
                <span className="text-leaf-600 font-bold flex-shrink-0">+{tx.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
