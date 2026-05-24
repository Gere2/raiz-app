/**
 * Helper compartido para rutas que proxean al backend Brain desde el POS.
 *
 * Por qué existe: Brain no expone CORS. El navegador del POS no puede llamar
 * directamente a brain.raizygrano.com, así que las rutas /api/* del POS
 * reenvían server-to-server.
 *
 * Uso:
 *   export async function POST(req: NextRequest, { params }: { params: ... }) {
 *     const { orgId } = await params
 *     return proxyToBrain(req, `/api/org/${orgId}/exam-pass/admin/grant`)
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

  // Algunos entornos guardan BRAIN_API_URL con sufijo "/api". Como aquí
  // construimos paths que ya empiezan por "/api", recortamos para evitar
  // "/api/api/...".
  const cleanBase = brainUrl.replace(/\/api\/?$/, "")
  const fullUrl = cleanBase + brainPath

  const auth = req.headers.get("authorization") ?? ""
  const method = req.method.toUpperCase()

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
      cache: "no-store",
    })
    // 4xx/5xx HTTP de Brain se propagan con su status. Solo caemos al catch
    // si fetch lanza (DNS/conexión/timeout).
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    const causeObj =
      error.cause && typeof error.cause === "object"
        ? (error.cause as Record<string, unknown>)
        : null
    const errorCode =
      typeof causeObj?.code === "string" ? causeObj.code : undefined

    console.error("[pos/brain-proxy] UPSTREAM_UNREACHABLE", {
      upstreamUrl: fullUrl,
      method,
      errorName: error.name,
      errorMessage: error.message,
      errorCode,
    })

    return NextResponse.json(
      {
        error: "UPSTREAM_UNREACHABLE",
        diagnostic: {
          upstreamUrl: fullUrl,
          method,
          errorName: error.name,
          errorMessage: error.message,
          errorCode,
          hint: "Revisa NEXT_PUBLIC_BRAIN_API_URL y deploy de Brain.",
        },
      },
      { status: 502 },
    )
  }
}
