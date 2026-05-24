"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { RaizGranoLogo } from "@/components/raizygrano-logo"
import { Leaf } from "@/components/leaf"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toaster"

export default function LoginPage() {
  const { signIn, loading, user } = useSimpleAuth()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [year, setYear] = useState<number>(2026)

  useEffect(() => {
    setYear(new Date().getFullYear())
  }, [])

  useEffect(() => {
    if (!loading && user) {
      router.replace(user?.role === "admin" ? "/" : "/pos")
    }
  }, [user, loading, router])

  const handleLogin = async () => {
    const e = String(email || "").trim().toLowerCase()
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Introduce un email v\u00e1lido (usuario)")
      return
    }
    if (!pin) {
      setError("Por favor ingresa tu PIN")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const u = await signIn(e, pin)
      router.push(u?.role === "admin" ? "/" : "/pos")
    } catch (err: any) {
      console.error("Error de inicio de sesión:", err)
      setError(err?.message || "Error al iniciar sesión")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0e9d2] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
        <span className="ml-2">Cargando...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0e9d2] bg-opacity-80 flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <RaizGranoLogo className="mx-auto mb-4" />
          <p className="text-muted-foreground italic">Sistema de punto de venta</p>
        </div>

        <Card className="border-secondary/30">
          <CardHeader>
            <CardTitle className="text-center font-serif">Bienvenido</CardTitle>
            <CardDescription className="text-center">Inicia sesión con tu email y PIN</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  className="w-full rounded-md border border-secondary/30 bg-white px-3 py-2 text-sm outline-none"
                  placeholder="empleado@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">PIN</label>
                <input
                  className="w-full rounded-md border border-secondary/30 bg-white px-3 py-2 text-sm outline-none"
                  placeholder="PIN / password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  inputMode="numeric"
                  type="password"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Verificando..." : "Entrar"}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Acceso denegado</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>

          <CardFooter>
            <p className="text-sm text-muted-foreground w-full text-center">© {year} RAÍZ y GRANO</p>
          </CardFooter>
        </Card>
      </div>

      {/* Decoración de hojas */}
      <div className="absolute top-0 left-0 w-32 h-32 overflow-hidden opacity-30 pointer-events-none">
        <div className="absolute -top-4 -left-4 transform rotate-45">
          <Leaf className="w-16 h-16 text-secondary" />
        </div>
        <div className="absolute top-8 left-8 transform -rotate-15">
          <Leaf className="w-12 h-12 text-secondary" />
        </div>
      </div>

      <div className="absolute bottom-0 right-0 w-32 h-32 overflow-hidden opacity-30 pointer-events-none">
        <div className="absolute -bottom-4 -right-4 transform -rotate-45">
          <Leaf className="w-16 h-16 text-secondary" />
        </div>
        <div className="absolute bottom-8 right-8 transform rotate-15">
          <Leaf className="w-12 h-12 text-secondary" />
        </div>
      </div>

      <Toaster />
    </div>
  )
}
