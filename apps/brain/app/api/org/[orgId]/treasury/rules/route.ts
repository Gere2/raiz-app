import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import { loadAllRules, seedRules } from "@/lib/treasury/store";
import type { TreasuryRule } from "@/lib/treasury/types";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/rules
 *
 * Lista todas las reglas de clasificación (seed + manual + learned).
 * Ordenadas por prioridad descendente — el orden en que se aplican.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const rules = await loadAllRules(orgId);
    rules.sort((a, b) => b.priority - a.priority);
    return NextResponse.json({ ok: true, rules, total: rules.length });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/treasury/rules
 *
 * Body soporta dos modos:
 *   { action: "seed" }                              → re-corre el seed idempotente
 *   { rule: TreasuryRule, source?: "manual" | ... } → upsert de regla manual
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json().catch(() => ({}));

    if (body?.action === "seed") {
      const result = await seedRules(orgId);
      return NextResponse.json({ ok: true, action: "seed", result });
    }

    if (!body?.rule) {
      return NextResponse.json(
        { error: "Body debe incluir 'rule' o 'action: seed'" },
        { status: 400 }
      );
    }

    const incoming = body.rule as Partial<TreasuryRule>;
    if (!incoming.id || !incoming.name || !incoming.matchers || !incoming.action) {
      return NextResponse.json(
        { error: "Regla incompleta: requiere id, name, matchers, action" },
        { status: 400 }
      );
    }

    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("treasury_rules")
      .doc(incoming.id);

    const existing = await ref.get();
    const baseSource: TreasuryRule["source"] =
      body.source === "learned" ? "learned" : "manual";

    const data: Partial<TreasuryRule> & Record<string, unknown> = {
      id: incoming.id,
      name: incoming.name,
      priority: incoming.priority ?? 100,
      version: (existing.data()?.version ?? 0) + 1,
      active: incoming.active ?? true,
      matchers: incoming.matchers,
      amountSign: incoming.amountSign ?? "any",
      action: incoming.action,
      source: existing.exists ? existing.data()?.source ?? baseSource : baseSource,
      learnedFrom: incoming.learnedFrom,
      notes: incoming.notes,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existing.exists) data.createdAt = FieldValue.serverTimestamp();

    await ref.set(data, { merge: true });
    return NextResponse.json({ ok: true, id: incoming.id, version: data.version });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
