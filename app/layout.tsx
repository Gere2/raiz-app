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
            <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
              <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
                <Link href="/" className="text-lg font-semibold">Raíz y Grano</Link>
                <nav className="flex items-center gap-4 text-sm">
                  <Link href="/orders" className="hover:underline">Mis pedidos</Link>
                  <Link href="/cart" className="hover:underline">🛒 Carrito</Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
            <Toaster position="top-center" />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
