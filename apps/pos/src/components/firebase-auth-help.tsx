import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { HelpCircle } from "lucide-react"

export function FirebaseAuthHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-2">
          <HelpCircle className="h-4 w-4 mr-2" />
          ¿Problemas con la autenticación?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración de autenticación en Firebase</DialogTitle>
          <DialogDescription>
            Si estás viendo errores de autenticación, sigue estos pasos para configurar Firebase correctamente:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <h3 className="font-medium">1. Accede a la consola de Firebase</h3>
            <p className="text-sm text-muted-foreground">
              Ve a{" "}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                console.firebase.google.com
              </a>{" "}
              y selecciona tu proyecto.
            </p>
          </div>

          <div>
            <h3 className="font-medium">2. Configura la autenticación</h3>
            <p className="text-sm text-muted-foreground">
              En el menú lateral, haz clic en "Authentication" y luego en la pestaña "Sign-in method".
            </p>
          </div>

          <div>
            <h3 className="font-medium">3. Habilita el método de correo/contraseña</h3>
            <p className="text-sm text-muted-foreground">
              Busca "Email/Password" en la lista de proveedores, haz clic en él y activa la opción "Enable". Guarda los
              cambios.
            </p>
          </div>

          <div>
            <h3 className="font-medium">4. Verifica las reglas de seguridad</h3>
            <p className="text-sm text-muted-foreground">
              En Firestore Database y Storage, asegúrate de que las reglas de seguridad permitan el acceso a usuarios
              autenticados.
            </p>
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm font-medium">
              Después de realizar estos cambios, vuelve a intentar registrarte o iniciar sesión.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
