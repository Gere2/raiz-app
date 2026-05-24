"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

type FirebaseIndexAlertProps = {
  indexUrl?: string | null
  onClose?: () => void
}

export function FirebaseIndexAlert({ indexUrl, onClose }: FirebaseIndexAlertProps) {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible || !indexUrl) return null

  const handleClose = () => {
    setIsVisible(false)
    if (onClose) onClose()
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Se requiere un índice en Firestore</AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          Firebase Firestore requiere un índice para realizar esta consulta. Esto es normal y solo necesitas crearlo una
          vez.
        </p>
        <div className="flex flex-col space-y-2">
          <a
            href={indexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm text-center"
          >
            Crear índice ahora
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="bg-transparent border-white text-white hover:bg-white/20"
          >
            Cerrar esta alerta
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
