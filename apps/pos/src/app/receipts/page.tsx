"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Search, Eye, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getTickets, getTicketsPaginated, type Ticket, deleteTicket } from "@/lib/ticket-service"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import { toast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { TicketDetail } from "@/components/ticket-detail"
import { TicketFilter } from "@/components/ticket-filter"
import { TicketSummary } from "@/components/ticket-summary"

export default function ReceiptsPage() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  const [receipts, setReceipts] = useState<Ticket[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedReceipt, setSelectedReceipt] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [filters, setFilters] = useState({
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
    minAmount: undefined as number | undefined,
    maxAmount: undefined as number | undefined,
    sortBy: "date-desc" as string,
  })

  useEffect(() => {
    if (orgId) loadTickets()
  }, [orgId])

  const loadTickets = async () => {
    if (!orgId) return
    try {
      setLoading(true)
      const tickets = await getTicketsPaginated(orgId, 50)
      setReceipts(tickets)
      setHasMore(tickets.length === 50)
    } catch (error) {
      console.error("Error al cargar tickets:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los tickets",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadMoreTickets = async () => {
    if (!orgId || !hasMore || receipts.length === 0) return
    try {
      setLoadingMore(true)
      const lastTicket = receipts[receipts.length - 1]
      const newTickets = await getTicketsPaginated(orgId, 50, lastTicket)
      setReceipts((prev) => [...prev, ...newTickets])
      setHasMore(newTickets.length === 50)
    } catch (error) {
      console.error("Error al cargar más tickets:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar más tickets",
      })
    } finally {
      setLoadingMore(false)
    }
  }

  // Función segura para formatear fechas
  const formatTicketDate = (ticketDate: any) => {
    try {
      if (!ticketDate) return "Fecha no disponible"

      // Si es un objeto Timestamp de Firestore
      if (typeof ticketDate === "object" && "toDate" in ticketDate) {
        return format(ticketDate.toDate(), "dd MMMM yyyy, HH:mm", { locale: es })
      }

      // Si es una fecha normal
      if (ticketDate instanceof Date) {
        return format(ticketDate, "dd MMMM yyyy, HH:mm", { locale: es })
      }

      // Si es un string o timestamp en milisegundos
      return format(new Date(ticketDate), "dd MMMM yyyy, HH:mm", { locale: es })
    } catch (error) {
      console.error("Error al formatear fecha:", error, ticketDate)
      return "Fecha no disponible"
    }
  }

  const filteredReceipts = receipts
    .filter((receipt) => {
      // Filtro de búsqueda
      const matchesSearch =
        searchTerm === "" ||
        receipt.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (receipt.ticketNumber && receipt.ticketNumber.toString().includes(searchTerm))

      // Filtro de fecha
      let receiptDate: Date
      try {
        if (receipt.date && typeof receipt.date === "object" && "toDate" in receipt.date) {
          receiptDate = receipt.date.toDate()
        } else if (receipt.date instanceof Date) {
          receiptDate = receipt.date
        } else if (receipt.date) {
          receiptDate = new Date(receipt.date)
        } else {
          receiptDate = new Date()
        }
      } catch (error) {
        console.error("Error al convertir fecha:", error)
        receiptDate = new Date()
      }

      const matchesDateFrom = !filters.dateFrom || receiptDate >= filters.dateFrom
      const matchesDateTo = !filters.dateTo || receiptDate <= filters.dateTo

      // Filtro de monto
      const matchesMinAmount = !filters.minAmount || receipt.total >= filters.minAmount
      const matchesMaxAmount = !filters.maxAmount || receipt.total <= filters.maxAmount

      return matchesSearch && matchesDateFrom && matchesDateTo && matchesMinAmount && matchesMaxAmount
    })
    .sort((a, b) => {
      // Ordenamiento
      let dateA: Date, dateB: Date

      try {
        if (a.date && typeof a.date === "object" && "toDate" in a.date) {
          dateA = a.date.toDate()
        } else if (a.date instanceof Date) {
          dateA = a.date
        } else if (a.date) {
          dateA = new Date(a.date)
        } else {
          dateA = new Date()
        }
      } catch (error) {
        dateA = new Date()
      }

      try {
        if (b.date && typeof b.date === "object" && "toDate" in b.date) {
          dateB = b.date.toDate()
        } else if (b.date instanceof Date) {
          dateB = b.date
        } else if (b.date) {
          dateB = new Date(b.date)
        } else {
          dateB = new Date()
        }
      } catch (error) {
        dateB = new Date()
      }

      switch (filters.sortBy) {
        case "date-asc":
          return dateA.getTime() - dateB.getTime()
        case "date-desc":
          return dateB.getTime() - dateA.getTime()
        case "amount-asc":
          return a.total - b.total
        case "amount-desc":
          return b.total - a.total
        default:
          return dateB.getTime() - dateA.getTime()
      }
    })

  const handleDeleteTicket = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este ticket?")) {
      return
    }

    try {
      setDeleting(true)
      await deleteTicket(orgId!, id)
      await loadTickets()
      setSelectedReceipt(null)
      setDialogOpen(false)
      toast({
        title: "Ticket eliminado",
        description: "El ticket se ha eliminado correctamente",
      })
    } catch (error) {
      console.error("Error al eliminar ticket:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el ticket",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectReceipt = (receipt: Ticket) => {
    console.log("Ticket seleccionado:", receipt)
    setSelectedReceipt(receipt)
    setDialogOpen(true)
  }

  return (
    <AuthenticatedLayout>
      <div className="container max-w-md mx-auto px-4 py-4 h-[100dvh] flex flex-col">
        <header className="flex items-center justify-between mb-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Tickets</h1>
          <div className="w-9"></div> {/* Spacer for alignment */}
        </header>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tickets..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <TicketFilter onFilterChange={(newFilters) => setFilters({
            dateFrom: newFilters.dateFrom,
            dateTo: newFilters.dateTo,
            minAmount: newFilters.minAmount,
            maxAmount: newFilters.maxAmount,
            sortBy: newFilters.sortBy,
          })} />
        </div>
        {filteredReceipts.length > 0 && <TicketSummary tickets={filteredReceipts} />}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Cargando tickets...</span>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-2 pb-4">
              {filteredReceipts.length === 0 ? (
                <div className="text-center p-4 text-muted-foreground">No se encontraron tickets</div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground px-4 pt-2">
                    Mostrando {filteredReceipts.length} de {receipts.length} tickets cargados
                  </div>
                  {filteredReceipts.map((receipt) => (
                    <Card key={receipt.id} className="cursor-pointer hover:bg-accent/50 transition-colors mx-2">
                      <CardContent className="p-3">
                        <div
                          className="flex items-center justify-between w-full"
                          onClick={() => handleSelectReceipt(receipt)}
                        >
                          <div className="text-left">
                            <div className="font-medium">
                              Ticket #{receipt.ticketNumber || receipt.id.substring(0, 6)}
                            </div>
                            <div className="text-sm text-muted-foreground">{formatTicketDate(receipt.date)}</div>
                            {receipt.userName && (
                              <div className="text-xs text-muted-foreground">Usuario: {receipt.userName}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">${receipt.total.toFixed(2)}</div>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {hasMore && (
                    <div className="px-4 pt-4">
                      <Button
                        onClick={loadMoreTickets}
                        disabled={loadingMore}
                        className="w-full"
                        variant="outline"
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Cargando...
                          </>
                        ) : (
                          "Cargar más"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Dialog para mostrar detalles del ticket */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            {selectedReceipt && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Ticket #{selectedReceipt.ticketNumber || selectedReceipt.id.substring(0, 6)}
                  </DialogTitle>
                </DialogHeader>
                <TicketDetail
                  ticket={selectedReceipt}
                  onDelete={() => {
                    handleDeleteTicket(selectedReceipt.id)
                  }}
                />
              </>
            )}
          </DialogContent>
        </Dialog>

        <Toaster />
      </div>
    </AuthenticatedLayout>
  )
}
