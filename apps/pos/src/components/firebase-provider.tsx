"use client"

import { useEffect, useState, type ReactNode } from "react"
import { isFirebaseInitialized } from "@/lib/firebase"
import { Loader2 } from "lucide-react"

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Verificar si Firebase está inicializado
    const checkFirebase = () => {
      if (isFirebaseInitialized()) {
        setIsInitialized(true)
      } else {
        // Intentar de nuevo en 100ms
        setTimeout(checkFirebase, 100)
      }
    }

    checkFirebase()
  }, [])

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando...</span>
      </div>
    )
  }

  return <>{children}</>
}
