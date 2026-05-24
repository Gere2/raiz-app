"use client"

import { useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Separator } from "@/components/ui/separator"
import { TicketActions } from "@/components/ticket-actions"
import { Mail, Loader2, Check, X } from "lucide-react"
import type { Ticket } from "@/lib/ticket-service"

interface TicketDetailProps {
  ticket: Ticket
  onDelete?: () => void
}

export function TicketDetail({ ticket, onDelete }: TicketDetailProps) {
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const formatTicketDate = () => {
    try {
      if (ticket.date && typeof ticket.date === "object" && "toDate" in ticket.date) {
        return format(ticket.date.toDate(), "dd MMMM yyyy, HH:mm", { locale: es })
      }
      if (ticket.date && ticket.date instanceof Date) {
        return format(ticket.date, "dd MMMM yyyy, HH:mm", { locale: es })
      }
      if (ticket.date) {
        return format(new Date(ticket.date), "dd MMMM yyyy, HH:mm", { locale: es })
      }
      return "Fecha no disponible"
    } catch (error) {
      return "Fecha no disponible"
    }
  }

  const handleSendEmail = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Introduce un email v\u00e1lido")
      return
    }

    setSending(true)
    setEmailError(null)

    try {
      const res = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.trim(),
          ticket: {
            ticketNumber: ticket.ticketNumber,
            total: ticket.total,
            items: ticket.items,
            userName: ticket.userName,
            paymentMethod: (ticket as any).paymentMethod || "CASH",
            fiscalData: ticket.fiscalData,
            dateFormatted: formatTicketDate(),
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al enviar")
      }

      setSent(true)
      setTimeout(() => {
        setSent(false)
        setShowEmailInput(false)
        setEmail("")
      }, 3000)
    } catch (err: any) {
      setEmailError(err.message || "No se pudo enviar el recibo")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="py-4">
      <div className="text-center mb-4">
        <h3 className="font-bold text-lg">{ticket.fiscalData?.businessName || "RAÍZ y GRANO"}</h3>
        {ticket.fiscalData?.taxId && <p className="text-sm">RFC: {ticket.fiscalData.taxId}</p>}
        {ticket.fiscalData?.address && <p className="text-sm">{ticket.fiscalData.address}</p>}
        {ticket.fiscalData?.phone && <p className="text-sm">Tel: {ticket.fiscalData.phone}</p>}
        {ticket.fiscalData?.email && <p className="text-sm">{ticket.fiscalData.email}</p>}
        <p className="text-sm mt-2">{formatTicketDate()}</p>
        <p className="text-sm font-bold mt-1">Ticket: #{ticket.ticketNumber || ticket.id.substring(0, 6)}</p>
        {ticket.userName && <p className="text-xs text-muted-foreground">Atendido por: {ticket.userName}</p>}
      </div>

      <Separator className="my-2" />

      <div className="space-y-2">
        {ticket.items && ticket.items.length > 0 ? (
          ticket.items.map((item, index) => (
            <div key={index} className="flex justify-between text-sm">
              <span>
                {item.quantity}x {item.product.name}
              </span>
              <span>{(item.product.price * item.quantity).toFixed(2)} €</span>
            </div>
          ))
        ) : (
          <div className="text-sm text-center text-muted-foreground">No hay productos en este ticket</div>
        )}
      </div>

      <Separator className="my-2" />

      <div className="flex justify-between font-bold mt-4">
        <span>Total</span>
        <span>{ticket.total ? ticket.total.toFixed(2) : "0.00"} €</span>
      </div>

      {ticket.fiscalData?.additionalInfo && (
        <div className="mt-4 text-xs text-center">{ticket.fiscalData.additionalInfo}</div>
      )}

      <div className="text-center text-xs mt-4">¡Gracias por su compra!</div>

      {/* Enviar por email */}
      <Separator className="my-4" />

      {!showEmailInput ? (
        <button
          onClick={() => setShowEmailInput(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all"
        >
          <Mail className="h-4 w-4" />
          Enviar recibo por email
        </button>
      ) : sent ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-green-50 border-2 border-green-200 py-3 text-sm font-medium text-green-700">
          <Check className="h-4 w-4" />
          Recibo enviado correctamente
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null) }}
              placeholder="cliente@email.com"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={(e) => e.key === "Enter" && handleSendEmail()}
              autoFocus
            />
            <button
              onClick={handleSendEmail}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sending ? "Enviando..." : "Enviar"}
            </button>
            <button
              onClick={() => { setShowEmailInput(false); setEmail(""); setEmailError(null) }}
              className="rounded-xl border border-gray-300 px-2.5 py-2.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {emailError && (
            <p className="text-xs text-red-600 px-1">{emailError}</p>
          )}
        </div>
      )}

      <TicketActions ticketId={ticket.id} onDelete={onDelete} />
    </div>
  )
}
