import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { CartProvider } from "@/components/cart-provider";
import { LanguageProvider } from "@/components/language-provider";
import { StandaloneProvider } from "@/components/standalone-provider";
import { Toaster } from "sonner";
import { BottomNav } from "@/components/bottom-nav";
import { AppHeader } from "@/components/app-header";
import { NotificationBanner } from "@/components/notification-banner";
import { NotificationPrompt } from "@/components/notification-prompt";
import { OrderListener } from "@/components/order-listener";
import { PWARegister } from "@/components/pwa-register";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ReportButton } from "@/components/report-button";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Raíz y Grano",
  description: "Order your specialty coffee and pick it up at the bar",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Raíz y Grano" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#312219",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Raíz y Grano" />
        {/* iOS Splash Screens */}
        <link rel="apple-touch-startup-image" href="/splash.svg" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>
          <StandaloneProvider>
            <AuthProvider>
              <CartProvider>
                <AppHeader />
                <NotificationBanner />
                <main className="mx-auto max-w-lg px-4 pt-4 pb-24">{children}</main>
                <BottomNav />
                <NotificationPrompt />
                <OrderListener />
                <ReportButton />
                <PWARegister />
                <PWAInstallPrompt />
                <Toaster position="top-center" toastOptions={{ style: { background: "#312219", color: "#faf7f2", border: "none", borderRadius: "12px", fontSize: "14px" } }} />
              </CartProvider>
            </AuthProvider>
          </StandaloneProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
