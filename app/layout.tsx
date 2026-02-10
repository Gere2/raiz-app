import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { CartProvider } from "@/components/cart-provider";
import { Toaster } from "sonner";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Raíz y Grano — Pedidos",
  description: "Haz tu pedido y recógelo en la barra",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>
          <CartProvider>
            <header className="sticky top-0 z-50 border-b border-brand-200 bg-brand-50/90 backdrop-blur-sm">
              <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-xl">☕</span>
                  <span className="text-lg font-semibold text-brand-900">Raíz y Grano</span>
                </Link>
                <nav className="flex items-center gap-4 text-sm">
                  <Link href="/orders" className="text-brand-700 hover:text-brand-900 transition-colors">Mis pedidos</Link>
                  <Link href="/cart" className="flex items-center gap-1 rounded-full bg-leaf-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-leaf-700">Carrito</Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
            <Toaster position="top-center" toastOptions={{ style: { background: "#312219", color: "#faf7f2", border: "none" } }} />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
