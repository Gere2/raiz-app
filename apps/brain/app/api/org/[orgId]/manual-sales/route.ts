import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

/**
 * Ventas manuales por producto (NO es POS).
 *
 * Modelo mínimo, org-scoped: orgs/{orgId}/manual_sales/{periodId}
 *   { periodId: "YYYY-MM", periodStart, periodEnd,
 *     lines: [{ recipeId?, productName, unitsSold }], createdAt, updatedAt }
 *
 * Una sola entrada por mes (las líneas se reemplazan al guardar). Sirve para
 * cruzar unidades vendidas con el margen del escandallo y estimar el "margen
 * aportado al mes". No toca tickets/orders ni el POS.
 */
type Params = { params: Promise<{ orgId: string }> };
type SaleLine = { recipeId?: string; productName: string; unitsSold: number };

const PERIOD_RE = /^\d{4}-\d{2}$/;
const currentPeriodId = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

function periodBounds(periodId: string): { periodStart: string; periodEnd: string } {
  const [y, m] = periodId.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // último día del mes
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

/** GET /api/org/[orgId]/manual-sales?period=YYYY-MM (default: mes actual) */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const periodId = req.nextUrl.searchParams.get("period") || currentPeriodId();
    if (!PERIOD_RE.test(periodId)) {
      return NextResponse.json({ error: "period inválido (YYYY-MM)" }, { status: 400 });
    }

    const snap = await db.collection("orgs").doc(orgId).collection("manual_sales").doc(periodId).get();
    const data = snap.exists ? snap.data() : null;
    const bounds = periodBounds(periodId);
    return NextResponse.json({
      periodId,
      periodStart: data?.periodStart || bounds.periodStart,
      periodEnd: data?.periodEnd || bounds.periodEnd,
      lines: (data?.lines as SaleLine[]) || [],
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/** PUT /api/org/[orgId]/manual-sales
 *  Body: { period?: "YYYY-MM", lines: [{ recipeId?, productName, unitsSold }] }
 *  Reemplaza las líneas del periodo (entrada manual sencilla). */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    const { uid } = await requireOrgMember(req, orgId);

    const body = await req.json();
    const periodId = (body.period as string) || currentPeriodId();
    if (!PERIOD_RE.test(periodId)) {
      return NextResponse.json({ error: "period inválido (YYYY-MM)" }, { status: 400 });
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines: SaleLine[] = rawLines
      .map((l: Record<string, unknown>) => ({
        recipeId: typeof l.recipeId === "string" ? l.recipeId : undefined,
        productName: String(l.productName || "").slice(0, 120),
        unitsSold: Math.max(0, Math.min(1_000_000, Math.round(Number(l.unitsSold) || 0))),
      }))
      .filter((l: SaleLine) => l.unitsSold > 0 && l.productName);

    const bounds = periodBounds(periodId);
    const ref = db.collection("orgs").doc(orgId).collection("manual_sales").doc(periodId);
    const exists = (await ref.get()).exists;
    await ref.set({
      periodId,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      lines,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    return NextResponse.json({ ok: true, periodId, lines });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
