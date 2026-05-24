"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { Loader2 } from "lucide-react"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: "admin" | "vendedor" | "any"
}

export function ProtectedRoute({ children, requiredRole = "any" }: ProtectedRouteProps) {
  const { user, loading } = useSimpleAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    } else if (!loading && user && requiredRole !== "any" && user.role !== requiredRole) {
      // Si el usuario no tiene el rol requerido
      if (requiredRole === "admin" && user.role !== "admin") {
        router.push("/acceso-denegado")
      }
    }
  }, [user, loading, router, requiredRole])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando...</span>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Verificar permisos
  if (requiredRole !== "any" && user.role !== requiredRole) {
    if (requiredRole === "admin" && user.role !== "admin") {
      return null // No renderizar nada mientras se redirige
    }
  }

  return <>{children}</>
}
