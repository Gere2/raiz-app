"use client"
import { useState, useEffect } from "react"
import { WifiOff } from "lucide-react"

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    setIsOffline(!navigator.onLine)
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-3 text-center font-semibold flex items-center justify-center gap-2 shadow-lg">
      <WifiOff className="h-5 w-5" />
      <span>Sin conexión — El POS necesita internet para funcionar. Comprueba tu red WiFi.</span>
    </div>
  )
}
