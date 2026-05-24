/**
 * GET /api/cron/expire-redemptions
 *
 * Vercel Cron Job: runs daily to expire stale redemptions across all orgs.
 * Protected by CRON_SECRET header check.
 *
 * Scheduled: daily at 3 AM UTC (configured in vercel.json)
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { expireStaleRedemptions } from "@/lib/loyalty-engine"

export async function GET(req: NextRequest) {
  // ── Security: Verify CRON_SECRET header ──
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("CRON_SECRET not configured")
    return NextResponse.json(
      { error: "Server misconfigured: no CRON_SECRET" },
      { status: 500 },
    )
  }

  const authHeader = req.headers.get("Authorization") || ""
  const expectedAuth = `Bearer ${cronSecret}`

  if (authHeader !== expectedAuth) {
    console.log(
      JSON.stringify({
        op: "cron.auth_failure",
        path: "/api/cron/expire-redemptions",
        ts: new Date().toISOString(),
      }),
    )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // ── Get all orgs from Firestore (paginated) ──
    const orgsSnap = await adminDb.collection("orgs").limit(100).get()
    const orgIds = orgsSnap.docs.map(d => d.id)

    console.log(
      JSON.stringify({
        op: "cron.expire_start",
        orgCount: orgIds.length,
        ts: new Date().toISOString(),
      }),
    )

    // ── Run expiry for each org ──
    const results: Record<string, any> = {}
    const errors: string[] = []

    for (const orgId of orgIds) {
      try {
        const result = await expireStaleRedemptions(orgId)
        results[orgId] = {
          expired: result.expired,
          errors: result.errors,
        }

        if (result.errors > 0) {
          errors.push(`${orgId}: ${result.errors} errors`)
        }

        console.log(
          JSON.stringify({
            op: "cron.expire_org_complete",
            orgId,
            expired: result.expired,
            errors: result.errors,
            ts: new Date().toISOString(),
          }),
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`${orgId}: ${errMsg}`)

        console.error(
          JSON.stringify({
            op: "cron.expire_org_error",
            orgId,
            error: errMsg,
            ts: new Date().toISOString(),
          }),
        )
      }
    }

    console.log(
      JSON.stringify({
        op: "cron.expire_complete",
        orgsProcessed: orgIds.length,
        errorCount: errors.length,
        ts: new Date().toISOString(),
      }),
    )

    return NextResponse.json({
      status: "success",
      message: `Expiry sweep complete for ${orgIds.length} orgs`,
      summary: results,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    console.error(
      JSON.stringify({
        op: "cron.expire_fatal_error",
        error: errMsg,
        ts: new Date().toISOString(),
      }),
    )

    return NextResponse.json(
      { error: "Cron job failed", message: errMsg },
      { status: 500 },
    )
  }
}
