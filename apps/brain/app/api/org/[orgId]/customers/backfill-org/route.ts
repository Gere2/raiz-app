/**
 * POST /api/org/:orgId/customers/backfill-org
 *
 * PR5: One-time migration — sets orgId on customer_profiles that don't have it.
 * Staff only. Idempotent (safe to run multiple times).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireOrgMember } from "@/lib/require-auth"
import { db as adminDb, FieldValue } from "@/lib/firebase-admin"
import { COLLECTIONS } from "@/lib/firebase-collections"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!caller.staff) {
    return NextResponse.json({ error: "Forbidden: staff only" }, { status: 403 })
  }

  const { orgId } = await params

  try { await requireOrgMember(req, orgId) } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get org details to identify profiles by email domain
  const orgSnap = await adminDb.collection(COLLECTIONS.ORGS).doc(orgId).get()
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }
  const orgData = orgSnap.data()
  const orgEmail = orgData?.adminEmail || ""
  const emailDomain = orgEmail.includes("@") ? orgEmail.split("@")[1] : null

  // Parse query params for dry-run mode
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get("dry-run") === "true"

  // Find profiles that:
  // 1. Don't have orgId yet, AND
  // 2. Match org email domain (if available)
  let snap
  if (emailDomain) {
    snap = await adminDb
      .collection(COLLECTIONS.CUSTOMER_PROFILES)
      .where("orgId", "==", null)
      .get()
  } else {
    snap = await adminDb
      .collection(COLLECTIONS.CUSTOMER_PROFILES)
      .where("orgId", "==", null)
      .get()
  }

  let updated = 0
  let skipped = 0
  const batch = adminDb.batch()
  const MAX_BATCH = 500
  const matchedProfiles = []

  for (const doc of snap.docs) {
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
      batch.update(doc.ref, { orgId, updatedAt: FieldValue.serverTimestamp() })
      updated++
      if (updated >= MAX_BATCH) break // Firestore batch limit
    }
  }

  if (updated > 0 && !dryRun) {
    await batch.commit()
  }

  return NextResponse.json({
    message: dryRun ? "Dry-run complete (no changes made)" : "Backfill complete",
    dryRun,
    updated: dryRun ? 0 : updated,
    wouldUpdate: dryRun ? matchedProfiles.length : 0,
    matchedProfiles: dryRun ? matchedProfiles : [],
    skipped,
    total: snap.size,
  })
}
