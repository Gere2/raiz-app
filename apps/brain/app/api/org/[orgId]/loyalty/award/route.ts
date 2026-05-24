/**
 * POST /api/org/:orgId/loyalty/award — Award points for a purchase
 *
 * Body: { uid, orderId, euroAmount, source, streakBonus?, productNames? }
 * Auth: Bearer token (staff or the user themselves)
 *
 * Hardened: input validation, euroAmount bounds, org scoping
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-auth"
import { awardPurchasePoints } from "@/lib/loyalty-engine"

const MAX_EURO_AMOUNT = 500 // sanity cap: no single order > 500€
const MAX_STREAK_BONUS = 500 // max streak bonus pts
const VALID_SOURCES = ["APP", "POS"] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  let caller
  try { caller = await requireAuth(req) } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // ── Required fields ──
  if (!body.uid || typeof body.uid !== "string") {
    return NextResponse.json({ error: "uid (string) required" }, { status: 400 })
  }
  if (!body.orderId || typeof body.orderId !== "string") {
    return NextResponse.json({ error: "orderId (string) required" }, { status: 400 })
  }
  if (typeof body.euroAmount !== "number" || !isFinite(body.euroAmount)) {
    return NextResponse.json({ error: "euroAmount (number) required" }, { status: 400 })
  }

  // ── Bounds validation ──
  const euroAmount = body.euroAmount as number
  if (euroAmount <= 0 || euroAmount > MAX_EURO_AMOUNT) {
    return NextResponse.json({ error: `euroAmount must be 0 < x ≤ ${MAX_EURO_AMOUNT}` }, { status: 400 })
  }

  const source = (body.source as string) || "APP"
  if (!VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
    return NextResponse.json({ error: `source must be APP or POS` }, { status: 400 })
  }

  // Validate streakBonus: must be non-negative and finite
  let streakBonus = typeof body.streakBonus === "number" ? body.streakBonus : 0
  if (!isFinite(streakBonus) || streakBonus < 0) {
    return NextResponse.json({ error: "streakBonus must be a non-negative finite number" }, { status: 400 })
  }
  streakBonus = Math.min(streakBonus, MAX_STREAK_BONUS)

  // ── Security: only staff can award for other users ──
  if (body.uid !== caller.uid && !caller.staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await awardPurchasePoints({
    orgId,
    uid: body.uid as string,
    orderId: body.orderId as string,
    euroAmount,
    source: source as "APP" | "POS",
    streakBonus,
    productNames: Array.isArray(body.productNames) ? body.productNames.filter((n: unknown) => typeof n === "string").slice(0, 50) : undefined,
    actorId: caller.uid,
  })

  console.log(
    JSON.stringify({
      op: "loyalty.award",
      orgId,
      uid: body.uid,
      balanceAfter: result.balanceAfter ?? null,
      source,
      orderId: body.orderId,
      result: result.success ? "success" : result.error,
      actorId: caller.uid,
      ts: new Date().toISOString(),
    }),
  )

  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
