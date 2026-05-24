"use client"

import type { ReactNode } from "react"
import { ProtectedRoute } from "../protected-route"
import { TicketCounterInitializer } from "../ticket-counter-initializer"

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <ProtectedRoute>
      <TicketCounterInitializer />
      {children}
    </ProtectedRoute>
  )
}
