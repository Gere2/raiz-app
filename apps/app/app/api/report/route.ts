/**
 * API: POST /api/report — Submit a bug/improvement report
 * Stores in top-level "reports" Firestore collection
 */

import { NextRequest, NextResponse } from "next/server"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { rateLimit } from "@/lib/rate-limiter"

// Simple rate limiting: 10 reports per hour per IP
const limiter = rateLimit({ windowMs: 3600_000, max: 10, message: "Demasiados reportes. Intenta más tarde." })

function initFirebaseAdmin() {
  if (getApps().length > 0) return
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

    if (projectId && clientEmail && privateKey) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    } else if (projectId) {
      initializeApp({ projectId })
    }
  } catch {
    // already initialized
  }
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const limited = limiter.check(req)
  if (limited) return limited

  try {
    initFirebaseAdmin()

    // Verify auth token
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "No auth token" }, { status: 401 })
    }

    const decoded = await getAuth().verifyIdToken(token)
    const body = await req.json()

    const { type, description, page, source } = body

    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 })
    }

    const db = getFirestore()
    const reportData = {
      type: type || "bug",          // "bug" | "improvement" | "other"
      description: description.trim(),
      page: page || "",             // page where report was made
      source: source || "APP",      // "APP" | "POS" | "BRAIN"
      userId: decoded.uid,
      userEmail: decoded.email || "",
      userName: decoded.name || decoded.email || "",
      status: "new",                // "new" | "reviewed" | "resolved" | "dismissed"
      createdAt: new Date(),
    }

    const ref = await db.collection("reports").add(reportData)

    return NextResponse.json({ ok: true, id: ref.id })
  } catch (e: unknown) {
    const err = e as { message?: string }
    console.error("[Report API]", err.message)
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 })
  }
}
