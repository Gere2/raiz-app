/**
 * /api/org/[orgId]/settings/anthropic-key
 *
 * Gestión BYOK de la clave Anthropic del café:
 *   GET    → estado { configured, last4 }   (nunca devuelve la clave)
 *   POST   → guarda/actualiza la clave  body { key }
 *   DELETE → borra la clave
 *
 * Solo un MIEMBRO de la org (requireOrgMember). La clave se cifra en reposo.
 */
import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import {
  setOrgAnthropicKey,
  getOrgAnthropicKeyStatus,
  deleteOrgAnthropicKey,
  looksLikeAnthropicKey,
  verifyAnthropicKey,
} from "@/lib/secrets/org-anthropic-key";

export const runtime = "nodejs"; // crypto + firebase-admin no corren en edge

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const status = await getOrgAnthropicKeyStatus(orgId);
    return NextResponse.json({ ok: true, ...status });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const body = (await req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!looksLikeAnthropicKey(key)) {
      return NextResponse.json(
        { error: "La clave no tiene el formato esperado (sk-ant-…)." },
        { status: 400 },
      );
    }

    const valid = await verifyAnthropicKey(key);
    if (!valid) {
      return NextResponse.json(
        { error: "Anthropic rechazó la clave (inválida o revocada)." },
        { status: 400 },
      );
    }

    const { last4 } = await setOrgAnthropicKey(orgId, key);
    return NextResponse.json({ ok: true, configured: true, last4 });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    await deleteOrgAnthropicKey(orgId);
    return NextResponse.json({ ok: true, configured: false, last4: null });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
