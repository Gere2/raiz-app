import Image from "next/image"
import { cn } from "@/lib/utils"

interface BrandLogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  variant?: "default" | "minimal" | "inverse"
}

export function BrandLogo({ className, size = "md", variant = "default" }: BrandLogoProps) {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-12",
  }

  const logoSrc =
    variant === "minimal" ? "/logo-minimal.svg" : variant === "inverse" ? "/logo-inverse.svg" : "/logo.svg"

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <Image src={logoSrc || "/placeholder.svg"} alt="Raíz y Grano" fill className="object-contain" priority />
    </div>
  )
}

export function PlantLogo({ className, size = "md" }: Omit<BrandLogoProps, "variant">) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  }

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <Image src="/plant-logo.svg" alt="Planta" fill className="object-contain" />
    </div>
  )
}
