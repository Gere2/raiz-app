"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActionButtonProps {
  children: ReactNode
  icon?: ReactNode
  loading?: boolean
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onClick?: () => void
  disabled?: boolean
  type?: "button" | "submit" | "reset"
}

export function ActionButton({
  children,
  icon,
  loading = false,
  variant = "default",
  size = "default",
  className,
  onClick,
  disabled = false,
  type = "button",
}: ActionButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn("font-medium", className)}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon ? <span className="mr-2">{icon}</span> : null}
      {children}
    </Button>
  )
}
