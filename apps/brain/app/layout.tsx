import "./globals.css";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { isEnverdeHost } from "./components/brand";
import { BrandProvider } from "./components/brand-context";

// El brain sirve DOS marcas: Raíz y Grano (single-tenant original) y Enverde
// (CFO multi-tenant para cafeterías, dominio app.enverde.app). Tanto el título
// de la pestaña como el chrome (login, sidebar) siguen al host: un café que
// llega por enverde.app no debe leer "Raíz y Grano / Brain" en su primer
// servicio. Default = Raíz (cualquier host no-enverde), intacta.
export async function generateMetadata(): Promise<Metadata> {
  if (isEnverdeHost((await headers()).get("host"))) {
    return {
      title: "Enverde · Tu CFO",
      description:
        "Sube el extracto de tu cafetería y sabe qué sueldo te puedes pagar este mes.",
    };
  }
  return {
    title: "Brain — Raíz y Grano",
    description: "Centro de operaciones de Raíz y Grano",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const host = (await headers()).get("host");
  return (
    <html lang="es" data-brand={isEnverdeHost(host) ? "enverde" : "raiz"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <BrandProvider host={host}>{children}</BrandProvider>
      </body>
    </html>
  );
}
