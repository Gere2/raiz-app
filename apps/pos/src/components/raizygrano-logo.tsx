import { Leaf } from "lucide-react"

export function RaizGranoLogo({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative w-16 h-16 mb-1">
        <Leaf className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 text-primary" />
        <Leaf className="absolute bottom-0 left-0 w-6 h-6 rotate-45 text-primary" />
        <Leaf className="absolute bottom-0 right-0 w-6 h-6 -rotate-45 text-primary" />
      </div>
      <div className="text-center font-serif">
        <div className="text-xl font-bold tracking-wide text-primary">RAÍZ y GRANO</div>
      </div>
    </div>
  )
}
