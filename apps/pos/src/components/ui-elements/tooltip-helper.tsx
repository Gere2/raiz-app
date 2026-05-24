import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface TooltipHelperProps {
  content: ReactNode
  children?: ReactNode
  icon?: ReactNode
  className?: string
  iconClassName?: string
}

export function TooltipHelper({ content, children, icon, className, iconClassName }: TooltipHelperProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center cursor-help", className)}>
            {children}
            {icon || <HelpCircle className={cn("h-4 w-4 ml-1 text-muted-foreground", iconClassName)} />}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
