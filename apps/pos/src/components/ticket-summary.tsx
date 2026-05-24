"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Ticket } from "@/lib/ticket-service"

interface TicketSummaryProps {
  tickets: Ticket[]
}

export function TicketSummary({ tickets }: TicketSummaryProps) {
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalTickets: 0,
    averageTicket: 0,
    topProducts: [] as { name: string; quantity: number; total: number }[],
  })

  useEffect(() => {
    if (tickets.length === 0) return

    // Calcular totales
    const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0)
    const totalTickets = tickets.length
    const averageTicket = totalSales / totalTickets

    // Calcular productos más vendidos
    const productMap = new Map<string, { name: string; quantity: number; total: number }>()

    tickets.forEach((ticket) => {
      ticket.items.forEach((item) => {
        const productId = item.product.id
        const current = productMap.get(productId) || {
          name: item.product.name,
          quantity: 0,
          total: 0,
        }

        productMap.set(productId, {
          name: item.product.name,
          quantity: current.quantity + item.quantity,
          total: current.total + item.product.price * item.quantity,
        })
      })
    })

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3)

    setSummary({
      totalSales,
      totalTickets,
      averageTicket,
      topProducts,
    })
  }, [tickets])

  if (tickets.length === 0) return null

  // Obtener la fecha más reciente y más antigua
  const dates = tickets.map((ticket) => new Date((ticket.date as any).toDate()))
  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())))
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())))

  const dateRange =
    minDate.getTime() === maxDate.getTime()
      ? format(minDate, "dd MMMM yyyy", { locale: es })
      : `${format(minDate, "dd MMM", { locale: es })} - ${format(maxDate, "dd MMM yyyy", { locale: es })}`

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Resumen de tickets</CardTitle>
        <p className="text-xs text-muted-foreground">{dateRange}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-xs text-muted-foreground">Total ventas</p>
            <p className="text-lg font-bold">${summary.totalSales.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tickets</p>
            <p className="text-lg font-bold">{summary.totalTickets}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Promedio</p>
            <p className="text-lg font-bold">${summary.averageTicket.toFixed(2)}</p>
          </div>
        </div>

        {summary.topProducts.length > 0 && (
          <>
            <Separator className="my-2" />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Productos más vendidos</p>
              <div className="space-y-1">
                {summary.topProducts.map((product, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="flex-1 truncate">{product.name}</span>
                    <span className="text-muted-foreground mr-2">{product.quantity}x</span>
                    <span>${product.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
