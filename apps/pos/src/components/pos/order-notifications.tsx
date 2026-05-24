"use client"

import { useState, useEffect, useRef } from "react"
import { Bell, X, Check, Clock, MapPin, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/use-toast"
import { listenForNewOrders, updateOrderStatus, type Order } from "@/lib/orders-service"

export function OrderNotifications() {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [hasNewOrders, setHasNewOrders] = useState(false)
  const [processingOrder, setProcessingOrder] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Crear elemento de audio
    audioRef.current = new Audio("/notification.mp3")

    // Escuchar nuevos pedidos
    const unsubscribe = listenForNewOrders((orders) => {
      if (orders.length > pendingOrders.length && orders.length > 0) {
        // Hay nuevos pedidos
        setHasNewOrders(true)
        // Reproducir sonido de notificación
        playNotificationSound()
        // Mostrar toast
        toast({
          title: "¡Nuevo pedido de profesor!",
          description: `${orders[0]?.teacherName} ha realizado un pedido`,
          variant: "default",
          duration: 10000,
        })
      }
      setPendingOrders(orders)
    })

    // Escuchar evento de índice requerido
    const handleIndexRequired = (event: CustomEvent) => {
      const { url } = event.detail
      toast({
        variant: "destructive",
        title: "Se requiere crear un índice en Firestore",
        description: "Haz clic en el botón 'Crear Índice' para solucionar este problema",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(url, "_blank")}
            className="bg-white text-black hover:bg-gray-100"
          >
            Crear Índice
          </Button>
        ),
        duration: 0, // No desaparece automáticamente
      })
    }

    window.addEventListener("firestore-index-required", handleIndexRequired as EventListener)

    return () => {
      unsubscribe()
      window.removeEventListener("firestore-index-required", handleIndexRequired as EventListener)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [pendingOrders.length])

  const playNotificationSound = () => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch((err) => console.error("Error playing sound:", err))
      }
    } catch (error) {
      console.error("Error al reproducir sonido:", error)
    }
  }

  const handleAcceptOrder = async (orderId: string) => {
    try {
      setProcessingOrder(orderId)
      await updateOrderStatus(orderId, "preparing")

      // Actualizar la lista local
      setPendingOrders((prev) => prev.filter((order) => order.id !== orderId))

      toast({
        title: "Pedido aceptado",
        description: "El pedido ha sido marcado como en preparación",
        variant: "success",
      })
    } catch (error) {
      console.error("Error al aceptar pedido:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado del pedido",
      })
    } finally {
      setProcessingOrder(null)
    }
  }

  const handleRejectOrder = async (orderId: string) => {
    try {
      setProcessingOrder(orderId)
      await updateOrderStatus(orderId, "cancelled")

      // Actualizar la lista local
      setPendingOrders((prev) => prev.filter((order) => order.id !== orderId))

      toast({
        title: "Pedido rechazado",
        description: "El pedido ha sido cancelado",
      })
    } catch (error) {
      console.error("Error al rechazar pedido:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado del pedido",
      })
    } finally {
      setProcessingOrder(null)
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant={hasNewOrders ? "default" : "outline"}
          size="icon"
          className={`rounded-full h-14 w-14 shadow-lg ${hasNewOrders ? "bg-primary animate-pulse" : "bg-background"}`}
          onClick={() => {
            setIsOpen(true)
            setHasNewOrders(false)
          }}
        >
          <Bell className="h-6 w-6" />
          {pendingOrders.length > 0 && (
            <Badge
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center"
              variant="destructive"
            >
              {pendingOrders.length}
            </Badge>
          )}
        </Button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-secondary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl font-serif">Pedidos de Profesores</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <ScrollArea className="h-[60vh]">
              {pendingOrders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No hay pedidos pendientes</div>
              ) : (
                <div className="p-4 space-y-4">
                  {pendingOrders.map((order) => (
                    <Card key={order.id} className="border-secondary/20">
                      <CardHeader className="p-3 pb-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-base font-medium">{order.teacherName}</CardTitle>
                            <div className="flex items-center text-xs text-muted-foreground mt-1">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date((order.createdAt as any).toDate()).toLocaleTimeString()}
                            </div>
                          </div>
                          <Badge
                            variant={order.deliveryType === "classroom" ? "default" : "outline"}
                            className="flex items-center gap-1"
                          >
                            {order.deliveryType === "classroom" ? (
                              <>
                                <MapPin className="h-3 w-3" />
                                Aula: {order.classroom}
                              </>
                            ) : (
                              <>
                                <ShoppingBag className="h-3 w-3" />
                                Recoger
                              </>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="p-3">
                        <div className="space-y-2">
                          {order.items.map((item, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span>
                                {item.quantity}x {item.productName}
                              </span>
                              <span>${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}

                          <Separator className="my-2" />

                          <div className="flex justify-between font-medium">
                            <span>Total:</span>
                            <span>${order.total.toFixed(2)}</span>
                          </div>

                          {order.notes && (
                            <div className="mt-2 text-xs bg-muted/30 p-2 rounded">
                              <span className="font-medium">Notas: </span>
                              {order.notes}
                            </div>
                          )}
                        </div>
                      </CardContent>

                      <CardFooter className="p-3 pt-0 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleRejectOrder(order.id)}
                          disabled={!!processingOrder}
                        >
                          {processingOrder === order.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                          ) : (
                            <>
                              <X className="h-4 w-4 mr-1" />
                              Rechazar
                            </>
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 bg-secondary hover:bg-secondary/80"
                          onClick={() => handleAcceptOrder(order.id)}
                          disabled={!!processingOrder}
                        >
                          {processingOrder === order.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Aceptar
                            </>
                          )}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      )}
    </>
  )
}
