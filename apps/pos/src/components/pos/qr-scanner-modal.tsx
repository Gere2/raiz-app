"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { X, Camera, AlertCircle, RefreshCw } from "lucide-react"

interface QRScannerModalProps {
  onScan: (value: string) => void
  onClose: () => void
}

/**
 * QR Scanner modal using html5-qrcode library.
 * Falls back to a manual UID input if the library isn't installed
 * or if camera permissions are denied.
 *
 * REQUIRES: npm install html5-qrcode
 */
export function QRScannerModal({ onScan, onClose }: QRScannerModalProps) {
  const scannerRef = useRef<any>(null)
  const scannerRunningRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState("")
  const [scannerReady, setScannerReady] = useState(false)
  const mountedRef = useRef(true)

  /** Safely stop the scanner only if it's actually running */
  const safeStop = useCallback(async () => {
    if (scannerRef.current && scannerRunningRef.current) {
      scannerRunningRef.current = false
      try {
        await scannerRef.current.stop()
      } catch {
        // Already stopped — ignore
      }
    }
  }, [])

  const initScanner = useCallback(async () => {
    setError(null)
    setScannerReady(false)

    // Cleanup previous instance
    await safeStop()
    scannerRef.current = null

    try {
      // Check HTTPS / localhost (getUserMedia requirement)
      if (typeof window !== "undefined" &&
          location.protocol !== "https:" &&
          location.hostname !== "localhost" &&
          location.hostname !== "127.0.0.1") {
        setError("La cámara requiere HTTPS. Accede al POS desde una URL segura (https://).")
        return
      }

      // Check if camera API is available
      if (!navigator?.mediaDevices?.getUserMedia) {
        setError("Este navegador no soporta acceso a la cámara. Usa Chrome o Safari actualizados.")
        return
      }

      // Pre-check camera permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        // Release the stream immediately — html5-qrcode will request its own
        stream.getTracks().forEach(t => t.stop())
      } catch (permErr: any) {
        if (permErr.name === "NotAllowedError" || permErr.name === "PermissionDeniedError") {
          setError("Permiso de cámara denegado. Permite el acceso en los ajustes del navegador y recarga la página.")
          return
        }
        if (permErr.name === "NotFoundError") {
          setError("No se detectó ninguna cámara en este dispositivo.")
          return
        }
        // Other errors — let html5-qrcode try anyway
      }

      // Dynamic import to avoid build errors if not installed
      const { Html5Qrcode } = await import("html5-qrcode")

      if (!containerRef.current || !mountedRef.current) return

      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText: string) => {
          // Stop scanner before firing callback
          safeStop().then(() => onScan(decodedText))
        },
        () => {
          // QR not found in this frame (normal)
        }
      )

      scannerRunningRef.current = true
      if (mountedRef.current) {
        setScannerReady(true)
      }
    } catch (err: any) {
      console.error("[QRScanner] Init error:", err)
      if (!mountedRef.current) return

      const msg = err?.message || String(err)
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Permiso de cámara denegado. Permite el acceso en los ajustes del navegador y recarga.")
      } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
        setError("No se detectó ninguna cámara en este dispositivo.")
      } else if (msg.includes("NotReadableError") || msg.includes("Could not start video source")) {
        setError("La cámara está siendo usada por otra app. Cierra otras apps y reintenta.")
      } else {
        setError("No se pudo iniciar el escáner. Usa el campo manual abajo.")
      }
    }
  }, [onScan, safeStop])

  useEffect(() => {
    mountedRef.current = true
    initScanner()

    return () => {
      mountedRef.current = false
      safeStop().then(() => { scannerRef.current = null })
    }
  }, [initScanner, safeStop])

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-gray-700" />
            <h2 className="text-base font-bold text-gray-900">Escanear QR</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scanner area */}
        <div className="p-4">
          {error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-700 mb-3">{error}</p>
              <button
                onClick={initScanner}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
              </button>
            </div>
          ) : (
            <div
              id="qr-reader"
              ref={containerRef}
              className="rounded-xl overflow-hidden bg-black"
              style={{ minHeight: 280 }}
            />
          )}

          {!scannerReady && !error && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Iniciando cámara...</span>
            </div>
          )}
        </div>

        {/* Manual fallback */}
        <div className="px-4 pb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 text-center">
            O introduce el código manualmente
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={40}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              placeholder="UID o código..."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
