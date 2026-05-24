/**
 * POST /api/org/:orgId/loyalty/redemption-use
 *
 * Same-origin proxy to Brain. Avoids browser CORS errors when the POS
 * (different origin) calls Brain directly.
 */
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params
  const brainUrl = process.env.NEXT_PUBLIC_BRAIN_API_URL || ""
  if (!brainUrl) {
    return NextResponse.json(
      { error: "BRAIN_API_URL not configured" },
      { status: 500 },
    )
  }

  const auth = req.headers.get("authorization") ?? ""
  const body = await req.text()

  try {
    const upstream = await fetch(
      `${brainUrl}/api/org/${orgId}/loyalty/redemption-use`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body,
      },
    )

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[redemption-use proxy] upstream error:", err)
    return NextResponse.json(
      { error: "Upstream Brain unreachable" },
      { status: 502 },
    )
  }
}
