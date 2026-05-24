"use client"

import { useRouter } from "next/navigation"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { RaizGranoLogo } from "@/components/raizygrano-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert, ArrowLeft } from "lucide-react"

export default function AccesoDenegadoPage() {
  const router = useRouter()
  const { user } = useSimpleAuth()

  return (
    <div className="min-h-screen bg-[#f0e9d2] bg-opacity-80 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <RaizGranoLogo className="mx-auto mb-4" />
        </div>

        <Card className="border-secondary/30">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle className="text-2xl font-serif text-destructive">Acceso Denegado</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-2">No tienes permisos para acceder a esta sección.</p>
            <p className="text-muted-foreground">
              Esta funcionalidad está reservada para usuarios con rol de administrador.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => router.push("/")} className="bg-secondary hover:bg-secondary/80">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
