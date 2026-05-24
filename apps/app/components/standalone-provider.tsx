"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

interface StandaloneContextType {
  isStandalone: boolean
  isIOS: boolean
}

const StandaloneContext = createContext<StandaloneContextType>({ isStandalone: false, isIOS: false })

export function StandaloneProvider({ children }: { children: ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as unknown as Record<string, unknown>).standalone === true)

    setIsStandalone(standalone)

    const ua = navigator.userAgent
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))

    // Add class to body for CSS targeting
    if (standalone) {
      document.body.classList.add("standalone-mode")
    }
  }, [])

  return (
    <StandaloneContext.Provider value={{ isStandalone, isIOS }}>
      {children}
    </StandaloneContext.Provider>
  )
}

export const useStandalone = () => useContext(StandaloneContext)
