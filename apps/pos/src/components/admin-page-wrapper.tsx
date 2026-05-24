"use client"

import { RoleGuard } from "@/components/role-guard"

/**
 * Wraps any page content to restrict access to admin users only.
 * Vendedores are redirected to /pos.
 */
export function AdminPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      {children}
    </RoleGuard>
  )
}
