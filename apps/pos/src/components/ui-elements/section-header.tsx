import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, icon, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      <div className="flex items-center">
        {icon && <div className="mr-2 text-primary">{icon}</div>}
        <div>
          <h2 className="text-xl font-serif font-medium text-primary">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
