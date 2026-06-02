import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db } from "@/lib/firebase-admin";
import {
  ensureDefaultAssumptions,
  loadAssumptions,
  upsertAssumption,
} from "@/lib/treasury/store";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/assumptions
 *
 *   ?monthId=2026-04   devuelve _default mergeado con override de ese mes
 *   (sin monthId)      devuelve solo _default
 *
 * Respuesta:
 *   {
 *     ok: true,
 *     monthId,
 *     assumptions: { foundersSalary, avgTicket, … },
 *     sources: ["_default", "2026-04"]   // de dónde vino cada layer
 *   }
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const url = new URL(req.url);
    const monthId = url.searchParams.get("monthId") ?? undefined;

    if (monthId && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) {
      return NextResponse.json({ error: "monthId inválido" }, { status: 400 });
    }

    await ensureDefaultAssumptions(orgId);
    const { assumptions, sources } = await loadAssumptions(orgId, monthId);

    // También devuelve listado completo de overrides existentes para UI
    const allSnap = await db.collection("orgs").doc(orgId).collection("treasury_assumptions").get();
    const overrides = allSnap.docs
      .filter((d) => d.id !== "_default")
      .map((d) => ({ monthId: d.id, ...d.data() }));

    return NextResponse.json({
      ok: true,
      monthId: monthId ?? null,
      assumptions,
      sources,
      overrides,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/treasury/assumptions
 *
 * Crea o sobrescribe el documento de un mes (o _default).
 *
 * Body:
 *   {
 *     monthId: "2026-04" | "_default",
 *     overrides: {
 *       foundersSalary?, foundersSalaryTarget?, avgTicket?,
 *       operatingDaysPerMonth?, foodCostTarget?, foodCostUpper?,
 *       grossMarginTarget?, cashSalesEstimate?, notes?
 *     }
 *   }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    const monthId = body.monthId;
    if (!monthId || (monthId !== "_default" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId))) {
      return NextResponse.json(
        { error: "monthId requerido (YYYY-MM o '_default')" },
        { status: 400 }
      );
    }

    if (!body.overrides || typeof body.overrides !== "object") {
      return NextResponse.json({ error: "overrides requerido" }, { status: 400 });
    }

    // Filtra a campos numéricos válidos (ignora basura)
    const allowed = [
      "foundersSalary",
      "foundersSalaryTarget",
      "avgTicket",
      "ticketsPerMonth",
      "operatingDaysPerMonth",
      "foodCostTarget",
      "foodCostUpper",
      "grossMarginTarget",
      "cashSalesEstimate",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (typeof body.overrides[k] === "number" && !isNaN(body.overrides[k])) {
        patch[k] = body.overrides[k];
      }
    }
    if (typeof body.overrides.notes === "string") {
      patch.notes = body.overrides.notes;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin campos válidos en overrides" }, { status: 400 });
    }

    const result = await upsertAssumption(orgId, monthId, patch);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
