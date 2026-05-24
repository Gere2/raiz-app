import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { LeafDecoration } from "@/components/cafe-icons"

interface PageContainerProps {
  children: ReactNode
  className?: string
  withDecorations?: boolean
}

export function PageContainer({ children, className, withDecorations = true }: PageContainerProps) {
  return (
    <div className="min-h-screen bg-cream-100 bg-opacity-80 relative">
      <div className={cn("container max-w-md mx-auto px-4 py-4 h-[100dvh] flex flex-col", className)}>{children}</div>

      {withDecorations && (
        <>
          <LeafDecoration position="top-left" className="text-olive-500" />
          <LeafDecoration position="bottom-right" className="text-olive-500" />
        </>
      )}
    </div>
  )
}
