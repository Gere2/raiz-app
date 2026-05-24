import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import {
  ensureDefaultAssumptions,
  loadAccounts,
  seedAccounts,
} from "@/lib/treasury/store";
import type { TreasuryAccount } from "@/lib/treasury/types";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/accounts
 *
 * Lista cuentas bancarias registradas (con role: tpv_collection / operating /
 * card / other). Útil para clasificar movimientos por origen y detectar
 * traspasos internos (PR2).
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const accounts = await loadAccounts(orgId);
    return NextResponse.json({ ok: true, accounts, total: accounts.length });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/treasury/accounts
 *
 *   { action: "seed" }      → crea santander_main, bbva_main + assumptions/_default
 *   { account: {...} }      → upsert manual de cuenta
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const body = await req.json().catch(() => ({}));

    if (body?.action === "seed") {
      const accounts = await seedAccounts(orgId);
      const assumptions = await ensureDefaultAssumptions(orgId);
      return NextResponse.json({
        ok: true,
        action: "seed",
        accounts,
        assumptions,
      });
    }

    if (!body?.account) {
      return NextResponse.json(
        { error: "Body debe incluir 'account' o 'action: seed'" },
        { status: 400 }
      );
    }

    const a = body.account as Partial<TreasuryAccount>;
    if (!a.id || !a.bank || !a.role) {
      return NextResponse.json(
        { error: "Cuenta incompleta: requiere id, bank, role" },
        { status: 400 }
      );
    }

    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("treasury_accounts")
      .doc(a.id);

    await ref.set(
      {
        id: a.id,
        bank: a.bank,
        alias: a.alias ?? a.id,
        last4: a.last4 ?? null,
        role: a.role,
        active: a.active ?? true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, id: a.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
