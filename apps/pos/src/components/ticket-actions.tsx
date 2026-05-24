"use client"

import { useState } from "react"
import { Printer, Download, Trash2, Loader2, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { deleteTicket } from "@/lib/ticket-service"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"

interface TicketActionsProps {
  ticketId: string
  onDelete?: () => void
}

export function TicketActions({ ticketId, onDelete }: TicketActionsProps) {
  const [deleting, setDeleting] = useState(false)
  const { user } = useAuth()
  const { orgId } = useOrg(user)

  const handlePrint = () => {
    // En una app real, esto activaría la funcionalidad de impresión
    toast({
      title: "Imprimiendo",
      description: "Enviando ticket a la impresora...",
    })
  }

  const handleDownload = () => {
    // En una app real, esto descargaría el ticket como PDF
    toast({
      title: "Descargando",
      description: "Descargando ticket como PDF...",
    })
  }

  const handleShare = () => {
    // En una app real, esto compartiría el ticket
    toast({
      title: "Compartiendo",
      description: "Compartiendo ticket...",
    })
  }

  const handleDeleteTicket = async () => {
    if (!confirm("¿Estás seguro de que quieres eliminar este ticket?")) {
      return
    }

    if (!orgId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró la organización",
      })
      return
    }

    try {
      setDeleting(true)
      await deleteTicket(orgId, ticketId)
      toast({
        title: "Ticket eliminado",
        description: "El ticket se ha eliminado correctamente",
      })
      if (onDelete) onDelete()
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

  return (
    <div className="flex gap-2 mt-6">
      <Button variant="outline" className="flex-1" onClick={handlePrint}>
        <Printer className="h-4 w-4 mr-2" />
        Imprimir
      </Button>
      <Button variant="outline" className="flex-1" onClick={handleDownload}>
        <Download className="h-4 w-4 mr-2" />
        Descargar
      </Button>
      <Button variant="outline" size="icon" onClick={handleShare}>
        <Share2 className="h-4 w-4" />
      </Button>
      <Button variant="destructive" size="icon" onClick={handleDeleteTicket} disabled={deleting}>
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </div>
  )
}
