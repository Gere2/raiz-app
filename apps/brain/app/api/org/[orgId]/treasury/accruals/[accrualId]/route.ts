import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { deleteAccrual, updateAccrual } from "@/lib/treasury/store";

type Params = { params: Promise<{ orgId: string; accrualId: string }> };

/**
 * PATCH /api/org/[orgId]/treasury/accruals/[accrualId]
 *
 * Body parcial:
 *   {
 *     amount?, category?, subcategory?, supplierName?,
 *     description?, status?, economicMonth?, pairedMovementId?
 *   }
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, accrualId } = await params;
    const body = await req.json();

    if (body.economicMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.economicMonth)) {
      return NextResponse.json(
        { error: "economicMonth inválido. Formato YYYY-MM." },
        { status: 400 }
      );
    }

    const allowed = [
      "economicMonth",
      "amount",
      "category",
      "subcategory",
      "supplierName",
      "description",
      "status",
      "pairedMovementId",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin campos a actualizar" }, { status: 400 });
    }

    await updateAccrual(orgId, accrualId, patch);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/** DELETE /api/org/[orgId]/treasury/accruals/[accrualId] */
export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, accrualId } = await params;
    await deleteAccrual(orgId, accrualId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
