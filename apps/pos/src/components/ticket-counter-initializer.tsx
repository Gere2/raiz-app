"use client"

import { useEffect, useState } from "react"
import { initializeTicketCounter } from "@/lib/fiscal-service"
import { getLastTicketNumber } from "@/lib/ticket-service"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"

export function TicketCounterInitializer() {
  const [initialized, setInitialized] = useState(false)
  const { user: simpleUser } = useSimpleAuth()
  const { user } = useAuth()
  const { orgId } = useOrg(user)

  useEffect(() => {
    // Solo inicializar cuando el usuario esté autenticado
    if (!simpleUser && !user) return
    if (!orgId) return

    const initialize = async () => {
      try {
        // Obtener el último número de ticket
        const lastNumber = await getLastTicketNumber(orgId)

        // Inicializar el contador (org-scoped) con el último número + 1
        await initializeTicketCounter(orgId, lastNumber + 1)

        setInitialized(true)
      } catch (error) {
        console.error("Error al inicializar contador de tickets:", error)
      }
    }

    initialize()
  }, [simpleUser, user, orgId]) // Dependencia en el usuario y orgId

  // Este componente no renderiza nada visible
  return null
}
