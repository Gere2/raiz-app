import "./globals.css";
import { headers } from "next/headers";
import type { Metadata } from "next";

// El brain sirve DOS marcas: Raíz y Grano (single-tenant original) y Enverde
// (CFO multi-tenant para cafeterías, dominio app.enverde.app). El título de la
// pestaña debe seguir al host: si no, un café que llega por enverde.app lee
// "Brain — Raíz y Grano" en la pantalla de su primer servicio. Default = Raíz
// (cualquier host no-enverde), así que Raíz no se ve afectada.
const ENVERDE_HOSTS = new Set(["app.enverde.app", "www.enverde.app"]);

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
  if (ENVERDE_HOSTS.has(host)) {
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
