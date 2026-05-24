/**
 * middleware.ts — Edge middleware for Brain
 *
 * Applies rate limiting to all /api/* routes.
 * Uses a simple in-memory sliding window per IP.
 * For distributed enforcement, migrate to Upstash Redis.
 */

import { NextRequest, NextResponse } from "next/server"

// ── In-memory store (per-edge-instance) ───────────────────────────
const hits = new Map<string, number[]>()
const WINDOW_MS = 60_000  // 1 minute
const MAX_REQUESTS = 30   // per IP per window
let lastCleanup = Date.now()

function getIP(req: NextRequest): string {
  // On Vercel, x-forwarded-for is set by the platform (trusted).
  // For other deployments, consider only accepting from trusted proxies.
  // Use the LAST entry added by the trusted proxy, not the first (client-controlled).
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const parts = forwarded.split(",").map(s => s.trim())
    // In Vercel, the rightmost IP is the one added by the platform
    return parts[parts.length - 1] || "unknown"
  }
  return req.headers.get("x-real-ip") ?? "unknown"
}

export function middleware(req: NextRequest) {
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  // Periodic cleanup
  if (now - lastCleanup > 5 * 60_000) {
    lastCleanup = now
    for (const [key, ts] of hits) {
      const fresh = ts.filter(t => t > cutoff)
      if (fresh.length === 0) hits.delete(key)
      else hits.set(key, fresh)
    }
  }

  const ip = getIP(req)
  const timestamps = (hits.get(ip) ?? []).filter(t => t > cutoff)
  timestamps.push(now)
  hits.set(ip, timestamps)

  if (timestamps.length > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
