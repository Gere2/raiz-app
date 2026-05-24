/**
 * Helper compartido para rutas que proxean al backend Brain.
 *
 * Por qué existe: Brain no expone cabeceras CORS, así que no podemos llamarlo
 * directamente desde el navegador. Las rutas /api/* de apps/app reenvían
 * server-to-server, mismo origen para el cliente.
 *
 * Uso:
 *   export async function GET(req: NextRequest) {
 *     const orgId = req.nextUrl.searchParams.get("org") ?? "raiz_y_grano"
 *     return proxyToBrain(req, `/api/org/${orgId}/exam-pass/quote`)
 *   }
 */
import { NextRequest, NextResponse } from "next/server"

export async function proxyToBrain(
  req: NextRequest,
  brainPath: string,
): Promise<NextResponse> {
  const brainUrl = process.env.NEXT_PUBLIC_BRAIN_API_URL
  if (!brainUrl) {
    return NextResponse.json(
      { error: "BRAIN_NOT_CONFIGURED" },
      { status: 500 },
    )
  }

  // BRAIN_API_URL en algunos entornos viene con sufijo "/api" para llamadas
  // desde el cliente. Como aquí ya construimos rutas que empiezan por "/api",
  // recortamos el sufijo si está presente para evitar "/api/api/...".
  const cleanBase = brainUrl.replace(/\/api\/?$/, "")
  const fullUrl = cleanBase + brainPath

  const auth = req.headers.get("authorization") ?? ""
  const method = req.method.toUpperCase()

  // Forward body solo si el método lo lleva.
  let body: string | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await req.text()
  }

  try {
    const upstream = await fetch(fullUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body,
      // No cache: estos endpoints son user-specific.
      cache: "no-store",
    })
    // Importante: respuestas HTTP de Brain (401/404/429/4xx/5xx) se propagan
    // con su status original. Solo caemos al catch si fetch() lanza, lo que
    // típicamente significa DNS/conexión/timeout (no llegamos a recibir HTTP).
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    // En Node/undici, fetch() coloca detalles de red en error.cause
    // (code, syscall, hostname). Los códigos típicos:
    //   ENOTFOUND          → DNS no resuelve el host (URL mal configurada)
    //   ECONNREFUSED       → host alcanzable pero nada escucha en el puerto
    //   ETIMEDOUT / UND_ERR_CONNECT_TIMEOUT → timeout de conexión
    //   ECONNRESET         → conexión cerrada a media respuesta
    const causeObj =
      error.cause && typeof error.cause === "object"
        ? (error.cause as Record<string, unknown>)
        : null
    const errorCode =
      typeof causeObj?.code === "string" ? causeObj.code : undefined
    const syscall =
      typeof causeObj?.syscall === "string" ? causeObj.syscall : undefined
    const hostname =
      typeof causeObj?.hostname === "string" ? causeObj.hostname : undefined

    const diagnostic = {
      upstreamUrl: fullUrl,
      method,
      errorName: error.name,
      errorMessage: error.message,
      errorCode,
      timestamp: new Date().toISOString(),
    }

    // Server-side: log con cause completo. NO se loguea Authorization ni body.
    console.error("[brain-proxy] UPSTREAM_UNREACHABLE", {
      ...diagnostic,
      cause: { syscall, hostname, code: errorCode },
    })

    return NextResponse.json(
      {
        error: "UPSTREAM_UNREACHABLE",
        diagnostic: {
          ...diagnostic,
          hint: "Revisa NEXT_PUBLIC_BRAIN_API_URL y que el deploy de Brain esté Ready y accesible. Errores HTTP de Brain (401/404/429/5xx) se propagan con su status — este 502 indica que ni siquiera se recibió respuesta HTTP.",
        },
      },
      { status: 502 },
    )
  }
}
