import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { ReactNode } from "react"

type StatusType = "success" | "warning" | "error" | "info" | "default"

interface StatusBadgeProps {
  status: StatusType
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function StatusBadge({ status, children, icon, className }: StatusBadgeProps) {
  const statusStyles = {
    success: "bg-success/20 text-success border-success/30",
    warning: "bg-warning/20 text-warning border-warning/30",
    error: "bg-destructive/20 text-destructive border-destructive/30",
    info: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    default: "bg-secondary/20 text-secondary border-secondary/30",
  }

  return (
    <Badge variant="outline" className={cn("font-normal py-1", statusStyles[status], className)}>
      {icon && <span className="mr-1">{icon}</span>}
      {children}
    </Badge>
  )
}
