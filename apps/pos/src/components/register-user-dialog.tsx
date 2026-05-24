"use client"

import { useState } from "react"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { NumericKeypad } from "@/components/numeric-keypad"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Loader2 } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

interface RegisterUserDialogProps {
  onClose: () => void
}

export function RegisterUserDialog({ onClose }: RegisterUserDialogProps) {
  const { registerUser, refreshUsers } = useSimpleAuth()
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [role, setRole] = useState<"admin" | "vendedor">("vendedor")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState(1)

  const handleRegister = async () => {
    // Validaciones
    if (!name.trim()) {
      setError("Por favor ingresa un nombre")
      return
    }

    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos")
      return
    }

    if (pin !== confirmPin) {
      setError("Los PINs no coinciden")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await registerUser(name, pin, role)
      await refreshUsers()
      toast({
        title: "Usuario registrado",
        description: `${name} ha sido registrado exitosamente`,
      })
      onClose()
    } catch (error: any) {
      console.error("Error de registro:", error)
      setError(error.message || "Error al registrar usuario")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md border-secondary/30">
        <CardHeader>
          <CardTitle className="text-center font-serif">Registrar Nuevo Usuario</CardTitle>
          <CardDescription className="text-center">
            {step === 1 ? "Ingresa los datos del usuario" : "Configura el PIN"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border border-secondary/30 rounded-md"
                  placeholder="Nombre del usuario"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de usuario</label>
                <Select onValueChange={(value) => setRole(value as "admin" | "vendedor")} defaultValue={role}>
                  <SelectTrigger className="border-secondary/30">
                    <SelectValue placeholder="Selecciona el tipo de usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ingresa PIN (mínimo 4 dígitos)</label>
                <NumericKeypad onValueChange={setPin} showValue={true} maxLength={6} />
              </div>

              {pin.length >= 4 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirma PIN</label>
                  <NumericKeypad onValueChange={setConfirmPin} showValue={true} maxLength={6} />
                </div>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={step === 1 ? onClose : () => setStep(1)} className="border-secondary/30">
            {step === 1 ? "Cancelar" : "Atrás"}
          </Button>

          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!name.trim()} className="bg-secondary hover:bg-secondary/80">
              Siguiente
            </Button>
          ) : (
            <Button
              onClick={handleRegister}
              disabled={isSubmitting || pin.length < 4 || pin !== confirmPin}
              className="bg-secondary hover:bg-secondary/80"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
