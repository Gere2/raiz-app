"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSimpleAuth } from "@/contexts/simple-auth-context"

type AllowedRole = "admin" | "vendedor"

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: AllowedRole[]
  fallbackRoute?: string
}

/**
 * Protects routes based on user role.
 * Redirects unauthorized users to fallbackRoute.
 */
export function RoleGuard({
  children,
  allowedRoles,
  fallbackRoute = "/pos",
}: RoleGuardProps) {
  const { user, isLoading } = useSimpleAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace("/login")
      return
    }
    if (!allowedRoles.includes(user.role as AllowedRole)) {
      router.replace(fallbackRoute)
    }
  }, [user, isLoading, allowedRoles, fallbackRoute, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    )
  }

  if (!user || !allowedRoles.includes(user.role as AllowedRole)) {
    return null
  }

  return <>{children}</>
}
