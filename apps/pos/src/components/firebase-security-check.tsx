"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react"

export function FirebaseSecurityCheck() {
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    checkFirestoreRules()
  }, [])

  const checkFirestoreRules = async () => {
    if (!db) {
      setStatus("error")
      setErrorMessage("Firestore no está inicializado")
      return
    }

    try {
      // Intentar escribir un documento de prueba
      const testCollection = collection(db, "_test_security")
      const docRef = await addDoc(testCollection, {
        test: true,
        createdAt: serverTimestamp(),
      })

      // Si llegamos aquí, la escritura fue exitosa
      // Ahora eliminamos el documento de prueba
      await deleteDoc(doc(db, "_test_security", docRef.id))

      setStatus("success")
    } catch (error: any) {
      console.error("Error al verificar reglas de seguridad:", error)
      setStatus("error")

      if (error.code === "permission-denied") {
        setErrorMessage("No tienes permisos para escribir en Firestore. Verifica las reglas de seguridad.")
      } else {
        setErrorMessage(`Error: ${error.message}`)
      }
    }
  }

  if (!isVisible) return null

  return (
    <div className="mb-4">
      {status === "checking" && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Verificando configuración</AlertTitle>
          <AlertDescription>Comprobando las reglas de seguridad de Firestore...</AlertDescription>
        </Alert>
      )}

      {status === "success" && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-700">Configuración correcta</AlertTitle>
          <AlertDescription className="text-green-600">
            Las reglas de seguridad de Firestore están configuradas correctamente.
            <Button variant="link" className="p-0 h-auto text-green-700" onClick={() => setIsVisible(false)}>
              Ocultar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error de configuración</AlertTitle>
          <AlertDescription>
            {errorMessage || "Hay un problema con las reglas de seguridad de Firestore."}
            <div className="mt-2">
              <p className="text-sm">Verifica las reglas de seguridad en la consola de Firebase:</p>
              <ol className="list-decimal list-inside text-sm mt-1">
                <li>Ve a la consola de Firebase</li>
                <li>Selecciona "Firestore Database"</li>
                <li>Haz clic en la pestaña "Reglas"</li>
                <li>Asegúrate de que las reglas permitan lectura/escritura para usuarios autenticados</li>
              </ol>
              <p className="text-sm mt-2">Ejemplo de reglas básicas:</p>
              <pre className="text-xs bg-black/10 p-2 rounded mt-1 overflow-x-auto">
                {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}
              </pre>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
