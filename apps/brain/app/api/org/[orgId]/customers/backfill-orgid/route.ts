/**
 * API: POST /api/org/:orgId/customers/backfill-orgid
 *
 * Backfill: Sets orgId on all customer_profiles that are missing it.
 * This fixes profiles created before PR5 orgId enforcement.
 *
 * Auth: requireAuth + requireOrgMember (staff only)
 */

import { NextResponse } from "next/server"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"
import { COLLECTIONS } from "@/lib/firebase-collections"

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAuth(req)
    const { orgId } = await params
    await requireOrgMember(req, orgId)

    // Get org details to identify profiles by email domain
    const orgSnap = await adminDb.collection(COLLECTIONS.ORGS).doc(orgId).get()
    if (!orgSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }
    const orgData = orgSnap.data()
    const orgEmail = orgData?.adminEmail || ""
    const emailDomain = orgEmail.includes("@") ? orgEmail.split("@")[1] : null

    // Parse query params for dry-run mode
    const url = new URL(req.url)
    const dryRun = url.searchParams.get("dry-run") === "true"

    // Find only profiles without orgId (filtered query)
    const allSnap = await adminDb
      .collection(COLLECTIONS.CUSTOMER_PROFILES)
      .where("orgId", "==", null)
      .get()

    let updated = 0
    let skipped = 0
    let errors = 0
    const BATCH_SIZE = 500
    let batch = adminDb.batch()
    let batchCount = 0
    const matchedProfiles = []

    for (const doc of allSnap.docs) {
      const data = doc.data()

      // Additional filter: if email domain available, only process matching emails
      if (emailDomain && data.email) {
        const profileDomain = (data.email as string).split("@")[1]
        if (profileDomain !== emailDomain) {
          skipped++
          continue
        }
      }

      matchedProfiles.push({ id: doc.id, email: data.email })

      if (!dryRun) {
        batch.update(doc.ref, {
          orgId: orgId,
          updatedAt: FieldValue.serverTimestamp(),
        })

        updated++
        batchCount++

        // Commit every BATCH_SIZE docs
        if (batchCount >= BATCH_SIZE) {
          try {
            await batch.commit()
          } catch (err) {
            console.error("[Backfill] Batch commit error:", err)
            errors += batchCount
          }
          batch = adminDb.batch()
          batchCount = 0
        }
      }
    }

    // Commit remaining
    if (batchCount > 0 && !dryRun) {
      try {
        await batch.commit()
      } catch (err) {
        console.error("[Backfill] Final batch commit error:", err)
        errors += batchCount
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      updated: dryRun ? 0 : updated,
      wouldUpdate: dryRun ? matchedProfiles.length : 0,
      matchedProfiles: dryRun ? matchedProfiles : [],
      skipped,
      errors,
      total: allSnap.size,
    })
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
