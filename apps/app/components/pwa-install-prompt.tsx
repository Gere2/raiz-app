"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/components/language-provider"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const { locale } = useLanguage()

  useEffect(() => {
    // Check if already installed (standalone mode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true)
      return
    }

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa-install-dismissed")
    if (dismissed) {
      const dismissedAt = parseInt(dismissed)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return // 7 days
    }

    // Detect iOS
    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    setIsIOS(isiOS)

    // Android/Desktop: capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      if ('prompt' in e) {
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        setTimeout(() => setShowPrompt(true), 3000) // Show after 3s
      }
    }
    window.addEventListener("beforeinstallprompt", handler)

    // iOS: show custom guide after delay
    if (isiOS && !window.matchMedia("(display-mode: standalone)").matches) {
      setTimeout(() => setShowPrompt(true), 5000) // Show after 5s
    }

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setShowPrompt(false)
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    } else if (isIOS) {
      setShowIOSGuide(true)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setShowIOSGuide(false)
    localStorage.setItem("pwa-install-dismissed", Date.now().toString())
  }

  if (isInstalled || !showPrompt) return null

  const texts = locale === "es" ? {
    title: "Instalar Raíz y Grano",
    subtitle: "Añade la app a tu pantalla de inicio para un acceso rápido",
    install: "Instalar",
    later: "Ahora no",
    iosTitle: "Cómo instalar en iPhone",
    iosStep1: "Pulsa el botón de compartir",
    iosStep2: 'Selecciona "Añadir a pantalla de inicio"',
    iosStep3: 'Pulsa "Añadir"',
    iosGot: "¡Entendido!",
  } : {
    title: "Install Raíz y Grano",
    subtitle: "Add the app to your home screen for quick access",
    install: "Install",
    later: "Not now",
    iosTitle: "How to install on iPhone",
    iosStep1: "Tap the Share button",
    iosStep2: 'Select "Add to Home Screen"',
    iosStep3: 'Tap "Add"',
    iosGot: "Got it!",
  }

  // iOS guide modal
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4" onClick={handleDismiss}>
        <div className="w-full max-w-sm animate-slide-up rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-center mb-5">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900">
              <span className="text-3xl">☕</span>
            </div>
            <h3 className="text-lg font-bold text-brand-900">{texts.iosTitle}</h3>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <span className="text-lg">1️⃣</span>
              </div>
              <div>
                <p className="text-sm font-medium text-brand-900">{texts.iosStep1}</p>
                <p className="text-xs text-brand-400 mt-0.5">
                  <span className="inline-block text-blue-500">
                    <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </span>
                  {" "}Safari bottom bar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <span className="text-lg">2️⃣</span>
              </div>
              <div>
                <p className="text-sm font-medium text-brand-900">{texts.iosStep2}</p>
                <p className="text-xs text-brand-400 mt-0.5">➕ Add to Home Screen</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <span className="text-lg">3️⃣</span>
              </div>
              <p className="text-sm font-medium text-brand-900">{texts.iosStep3}</p>
            </div>
          </div>

          <button onClick={handleDismiss} className="w-full rounded-2xl bg-leaf-600 py-3.5 text-sm font-semibold text-white hover:bg-leaf-700 shadow-lg shadow-leaf-600/20">
            {texts.iosGot}
          </button>
        </div>
      </div>
    )
  }

  // Install banner
  return (
    <div className="fixed bottom-20 left-0 right-0 z-[60] px-4 animate-slide-up">
      <div className="mx-auto max-w-lg rounded-2xl bg-white border border-brand-200 p-4 shadow-xl shadow-brand-900/10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-900 shadow-sm">
            <span className="text-2xl">☕</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-900">{texts.title}</p>
            <p className="text-xs text-brand-500 mt-0.5">{texts.subtitle}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={handleInstall} className="flex-1 rounded-xl bg-leaf-600 py-2.5 text-sm font-semibold text-white hover:bg-leaf-700 transition-colors shadow-sm">
            {texts.install}
          </button>
          <button onClick={handleDismiss} className="flex-1 rounded-xl border border-brand-200 py-2.5 text-sm font-medium text-brand-500 hover:bg-brand-50 transition-colors">
            {texts.later}
          </button>
        </div>
      </div>
    </div>
  )
}
