/**
 * lib/rate-limiter.ts
 *
 * In-memory sliding-window rate limiter.
 * Works on Vercel serverless (per-instance) and provides baseline
 * protection against burst abuse. For distributed rate limiting,
 * replace the store with Upstash Redis / Vercel KV.
 *
 * Usage in a Next.js API route:
 *   import { rateLimit } from "@/lib/rate-limiter"
 *   const limiter = rateLimit({ windowMs: 60_000, max: 10 })
 *
 *   export async function POST(req: Request) {
 *     const limited = limiter.check(req)
 *     if (limited) return limited          // 429 response
 *     // ... normal handler
 *   }
 */

import { NextResponse } from "next/server"

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60 000 = 1 min) */
  windowMs?: number
  /** Max requests per window per key (default: 20) */
  max?: number
  /** Custom message for 429 response */
  message?: string
}

interface HitRecord {
  timestamps: number[]
}

/**
 * Create a rate limiter instance.
 * Each call returns an independent limiter with its own store.
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 20
  const message = opts.message ?? "Too many requests. Please try again later."

  const store = new Map<string, HitRecord>()

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  let lastCleanup = Date.now()
  const CLEANUP_INTERVAL = 5 * 60 * 1000

  function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    const cutoff = now - windowMs
    for (const [key, record] of Array.from(store.entries())) {
      record.timestamps = record.timestamps.filter((t: number) => t > cutoff)
      if (record.timestamps.length === 0) store.delete(key)
    }
  }

  /**
   * Extract a rate-limit key from the request.
   * Uses X-Forwarded-For (Vercel), X-Real-IP, or falls back to a generic key.
   */
  function getKey(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) return forwarded.split(",")[0].trim()
    const realIp = req.headers.get("x-real-ip")
    if (realIp) return realIp
    return "unknown"
  }

  /**
   * Check the rate limit for an incoming request.
   * Returns `null` if under limit, or a 429 `NextResponse` if over limit.
   */
  function check(req: Request): NextResponse | null {
    cleanup()

    const key = getKey(req)
    const now = Date.now()
    const cutoff = now - windowMs

    let record = store.get(key)
    if (!record) {
      record = { timestamps: [] }
      store.set(key, record)
    }

    // Slide the window
    record.timestamps = record.timestamps.filter(t => t > cutoff)
    record.timestamps.push(now)

    if (record.timestamps.length > max) {
      return NextResponse.json(
        { error: message },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(windowMs / 1000)),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
          },
        }
      )
    }

    return null
  }

  return { check }
}
