import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { createAccrual, loadAccruals } from "@/lib/treasury/store";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/accruals
 *
 *   ?economicMonth=2026-04   filtra por mes económico
 *   ?status=pending          filtra por estado
 *
 * Lista accruals (devengos manuales). PR4 los introduce para meter:
 *   - Café 660 € pendiente de abril (factura recibida pero no pagada).
 *   - Reasignación temporal de gastos pagados en otro mes.
 *   - Cargos previstos no facturados aún.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const url = new URL(req.url);
    const economicMonth = url.searchParams.get("economicMonth") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const accruals = await loadAccruals(orgId, { economicMonth, status });
    return NextResponse.json({ ok: true, accruals, total: accruals.length });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/treasury/accruals
 *
 * Crea un accrual nuevo.
 *
 * Body:
 *   {
 *     economicMonth: "2026-04",
 *     amount: -660,                  // negativo = gasto, positivo = ingreso
 *     category: "materia_prima",
 *     subcategory?: "cafe",
 *     supplierName?: "Amor Perfecto",
 *     description: "Factura abril sin pagar",
 *     status?: "pending" | "paid" | "cancelled",  // default "pending"
 *     pairedMovementId?: string                   // si compensa un mov real
 *   }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    if (!body.economicMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.economicMonth)) {
      return NextResponse.json(
        { error: "economicMonth requerido en formato YYYY-MM" },
        { status: 400 }
      );
    }
    if (typeof body.amount !== "number" || isNaN(body.amount)) {
      return NextResponse.json({ error: "amount numérico requerido" }, { status: 400 });
    }
    if (!body.category) {
      return NextResponse.json({ error: "category requerido" }, { status: 400 });
    }

    const id = await createAccrual(orgId, {
      economicMonth: body.economicMonth,
      amount: body.amount,
      category: body.category,
      subcategory: body.subcategory,
      description: body.description,
      status: body.status ?? "pending",
      ...(body.supplierName ? { supplierName: body.supplierName } : {}),
      ...(body.pairedMovementId ? { pairedMovementId: body.pairedMovementId } : {}),
      createdBy: uid,
    } as Parameters<typeof createAccrual>[1]);

    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
