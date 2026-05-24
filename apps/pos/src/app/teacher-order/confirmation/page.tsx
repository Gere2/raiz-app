"use client"

import { useRouter } from "next/navigation"
import { CheckCircle, ArrowLeft, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function OrderConfirmationPage() {
  const router = useRouter()

  return (
    <div className="container max-w-md mx-auto px-4 py-4 h-[100dvh] flex flex-col items-center justify-center">
      <Card className="w-full border-secondary/30">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-success" />
          </div>
          <CardTitle className="text-2xl font-serif">¡Pedido Recibido!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p>Su pedido ha sido enviado correctamente y está siendo procesado.</p>
          <p className="text-muted-foreground">Recibirá una notificación cuando su pedido esté listo.</p>

          <div className="flex flex-col gap-2 mt-6">
            <Button variant="outline" className="border-secondary/30" onClick={() => router.push("/teacher-order")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Realizar otro pedido
            </Button>

            <Button className="bg-secondary hover:bg-secondary/80" onClick={() => router.push("/")}>
              <Home className="h-4 w-4 mr-2" />
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
