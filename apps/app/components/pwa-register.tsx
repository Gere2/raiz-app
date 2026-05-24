"use client"

import { useEffect } from "react"

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    // Register SW
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        console.log("SW registered:", registration.scope)

        // Check for updates periodically
        setInterval(() => registration.update(), 60 * 60 * 1000) // Every hour
      })
      .catch((err) => console.error("SW registration failed:", err))

    // Handle SW updates
    let refreshing = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  }, [])

  return null
}
