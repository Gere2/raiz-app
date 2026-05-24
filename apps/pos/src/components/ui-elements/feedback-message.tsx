import type { ReactNode } from "react"
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

type FeedbackType = "success" | "warning" | "error" | "info"

interface FeedbackMessageProps {
  type: FeedbackType
  title?: string
  children: ReactNode
  className?: string
  icon?: ReactNode
}

export function FeedbackMessage({ type, title, children, className, icon }: FeedbackMessageProps) {
  const getIcon = () => {
    if (icon) return icon

    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4" />
      case "warning":
        return <AlertTriangle className="h-4 w-4" />
      case "error":
        return <AlertCircle className="h-4 w-4" />
      case "info":
        return <Info className="h-4 w-4" />
    }
  }

  const getVariant = () => {
    switch (type) {
      case "success":
        return "success"
      case "warning":
        return "warning"
      case "error":
        return "destructive"
      case "info":
        return "default"
    }
  }

  return (
    <Alert
      variant={getVariant()}
      className={cn(
        "border-l-4",
        {
          "border-l-success": type === "success",
          "border-l-warning": type === "warning",
          "border-l-destructive": type === "error",
          "border-l-primary": type === "info",
        },
        className,
      )}
    >
      {getIcon()}
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
