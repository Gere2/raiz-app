import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; voucherId: string }> };

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * POST /api/org/[orgId]/vouchers/[voucherId]
 * Body: { action: "redeem" | "undo" }
 *
 * Transaccional: redeem decrementa usesLeft (y completa al llegar a 0);
 * undo lo repone (p. ej. canje marcado por error delante del cliente).
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId, voucherId } = await params;
    await requireOrgMember(req, orgId);
    const { action } = await req.json();

    if (action !== "redeem" && action !== "undo") {
      return NextResponse.json({ error: "action debe ser redeem o undo" }, { status: 400 });
    }

    const ref = db.collection("orgs").doc(orgId).collection("vouchers").doc(voucherId);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError("Bono no encontrado", 404);
      const v = snap.data() as { usesLeft: number; usesTotal: number };

      if (action === "redeem") {
        if (v.usesLeft <= 0) throw new HttpError("El bono no tiene usos pendientes", 409);
        const usesLeft = v.usesLeft - 1;
        tx.update(ref, {
          usesLeft,
          status: usesLeft === 0 ? "completed" : "active",
          lastUsedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { usesLeft };
      }

      if (v.usesLeft >= v.usesTotal) throw new HttpError("El bono ya tiene todos los usos disponibles", 409);
      const usesLeft = v.usesLeft + 1;
      tx.update(ref, {
        usesLeft,
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { usesLeft };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { orgId, voucherId } = await params;
    await requireOrgMember(req, orgId);

    await db.collection("orgs").doc(orgId).collection("vouchers").doc(voucherId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
