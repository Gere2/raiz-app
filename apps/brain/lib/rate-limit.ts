/**
 * lib/rate-limit.ts — Rate-limit helpers for Brain API routes
 *
 * Pre-configured limiters for different route categories.
 * Import and call `.check(req)` at the top of any handler.
 *
 * Usage:
 *   import { apiLimiter } from "@/lib/rate-limit"
 *   const limited = apiLimiter.check(req)
 *   if (limited) return limited
 */

import { NextResponse } from "next/server"

interface RateLimitOptions {
  windowMs?: number
  max?: number
  message?: string
}

interface HitRecord {
  timestamps: number[]
}

function createLimiter(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 30
  const message = opts.message ?? "Too many requests. Please try again later."

  const store = new Map<string, HitRecord>()
  let lastCleanup = Date.now()
  const CLEANUP_INTERVAL = 5 * 60 * 1000

  function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    const cutoff = now - windowMs
    for (const [key, record] of store) {
      record.timestamps = record.timestamps.filter(t => t > cutoff)
      if (record.timestamps.length === 0) store.delete(key)
    }
  }

  function getKey(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) {
      const parts = forwarded.split(",").map(s => s.trim())
      // Use the rightmost IP (added by trusted proxy like Vercel)
      return parts[parts.length - 1] || "unknown"
    }
    return req.headers.get("x-real-ip") ?? "unknown"
  }

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

/** General API limiter: 30 req/min per IP */
export const apiLimiter = createLimiter({ windowMs: 60_000, max: 30 })

/** Loyalty/write operations: 15 req/min per IP */
export const loyaltyLimiter = createLimiter({
  windowMs: 60_000,
  max: 15,
  message: "Demasiadas operaciones de loyalty. Espera un momento.",
})

/** CRON endpoints: 5 req/min (only automated calls expected) */
export const cronLimiter = createLimiter({
  windowMs: 60_000,
  max: 5,
  message: "Too many CRON requests.",
})
