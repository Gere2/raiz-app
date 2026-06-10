import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

/**
 * Bonos simples (Enverde) — orgs/{orgId}/vouchers
 *
 * Módulo aditivo e independiente de exam-pass: aquí el bono lo crea el dueño
 * del café para un cliente identificado por nombre (sin UID Firebase ni
 * catálogo Stripe). Canje/deshacer en vouchers/[voucherId].
 */

type Params = { params: Promise<{ orgId: string }> };

const PAYMENT_METHODS = new Set(["cash", "card_terminal"]);
const MAX_USES = 100;
const MAX_NAME = 120;
const MAX_NOTE = 500;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs").doc(orgId).collection("vouchers")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ vouchers });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/vouchers
 * Body: { customerName, customerRef?, usesTotal, pricePaid?, paymentMethod?, note? }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId } = await params;
    const { uid } = await requireOrgMember(req, orgId);
    const body = await req.json();

    const customerName = clip(body.customerName, MAX_NAME);
    if (!customerName) {
      return NextResponse.json({ error: "customerName obligatorio" }, { status: 400 });
    }

    const usesTotal = Number(body.usesTotal);
    if (!Number.isInteger(usesTotal) || usesTotal < 1 || usesTotal > MAX_USES) {
      return NextResponse.json({ error: `usesTotal debe ser un entero entre 1 y ${MAX_USES}` }, { status: 400 });
    }

    const paymentMethod = body.paymentMethod ?? "cash";
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "paymentMethod debe ser cash o card_terminal" }, { status: 400 });
    }

    let pricePaid: number | null = null;
    if (body.pricePaid !== undefined && body.pricePaid !== null && body.pricePaid !== "") {
      pricePaid = Number(body.pricePaid);
      if (!Number.isFinite(pricePaid) || pricePaid < 0) {
        return NextResponse.json({ error: "pricePaid debe ser un número ≥ 0" }, { status: 400 });
      }
    }

    const ref = db.collection("orgs").doc(orgId).collection("vouchers").doc();
    await ref.set({
      customerName,
      customerRef: clip(body.customerRef, MAX_NAME),
      usesTotal,
      usesLeft: usesTotal,
      pricePaid,
      paymentMethod,
      note: clip(body.note, MAX_NOTE),
      status: "active",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
