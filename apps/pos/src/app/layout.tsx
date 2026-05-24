import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { SimpleAuthProvider } from "@/contexts/simple-auth-context"
import { OfflineBanner } from "@/components/offline-banner"
import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"

export const metadata: Metadata = {
  title: "Raíz y Grano — POS",
  description: "Panel POS + pedidos APP",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="light">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>
          <SimpleAuthProvider>
            <OfflineBanner />
            {children}
            <ShadcnToaster />
            <SonnerToaster position="top-right" richColors />
          </SimpleAuthProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
