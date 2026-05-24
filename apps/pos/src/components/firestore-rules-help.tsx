"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { HelpCircle, Info, ExternalLink } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useSimpleAuth } from "@/contexts/simple-auth-context"

export function FirestoreRulesHelp() {
  const { firestoreAvailable } = useSimpleAuth()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={firestoreAvailable ? "outline" : "destructive"} size="sm" className="mt-2">
          <HelpCircle className="h-4 w-4 mr-2" />
          Configuración de Firestore
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración de Firestore</DialogTitle>
          <DialogDescription>
            Para que la aplicación funcione correctamente, necesitas configurar las reglas de seguridad de Firestore.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {!firestoreAvailable && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertTitle>Error de conexión</AlertTitle>
              <AlertDescription>
                No se pudo establecer conexión con Firestore o no tienes permisos suficientes. Por favor, configura las
                reglas de seguridad siguiendo las instrucciones a continuación.
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t">
            <h3 className="font-medium">Configuración de reglas de Firestore</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Sigue estos pasos para configurar correctamente las reglas de seguridad de Firestore:
            </p>
          </div>

          <div>
            <h3 className="font-medium">1. Accede a la consola de Firebase</h3>
            <p className="text-sm text-muted-foreground">
              Ve a{" "}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline flex items-center"
              >
                console.firebase.google.com
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>{" "}
              y selecciona tu proyecto.
            </p>
          </div>

          <div>
            <h3 className="font-medium">2. Configura las reglas de Firestore</h3>
            <p className="text-sm text-muted-foreground">
              En el menú lateral, haz clic en "Firestore Database" y luego en la pestaña "Rules".
            </p>
          </div>

          <div>
            <h3 className="font-medium">3. Actualiza las reglas con lo siguiente:</h3>
            <pre className="text-xs bg-gray-100 p-3 rounded-md overflow-x-auto mt-2">
              {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir acceso a todas las colecciones (para desarrollo)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Nota importante:</strong> Estas reglas permiten acceso completo a todas las colecciones. Son
              adecuadas para desarrollo, pero para producción deberías implementar reglas más restrictivas.
            </p>
          </div>

          <div>
            <h3 className="font-medium">4. Publica las reglas</h3>
            <p className="text-sm text-muted-foreground">
              Haz clic en el botón "Publish" (Publicar) y espera a que aparezca la confirmación de que las reglas se han
              publicado correctamente.
            </p>
          </div>

          <div>
            <h3 className="font-medium">5. Verifica que Firestore está habilitado</h3>
            <p className="text-sm text-muted-foreground">
              Si acabas de crear el proyecto, es posible que necesites habilitar Firestore:
            </p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 mt-1">
              <li>En la consola de Firebase, haz clic en "Firestore Database"</li>
              <li>Si ves un botón "Create database", haz clic en él</li>
              <li>Selecciona "Start in test mode" y haz clic en "Next"</li>
              <li>Selecciona la ubicación más cercana a tus usuarios y haz clic en "Enable"</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
