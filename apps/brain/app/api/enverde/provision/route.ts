/**
 * POST /api/enverde/provision  (T1 — puente enverde → brain)
 *
 * Provisión server-to-server: enverde llama aquí al completar su funnel
 * (/probar/cfo-cafeteria-especialidad) para dar de alta una org nueva en el
 * brain y obtener un custom token con el que el café entra autenticado.
 *
 * Contrato completo: ../../../ENVERDE-BRIDGE.md
 *
 * Seguridad:
 *   - Protegido por secreto compartido (header x-enverde-secret), comparado en
 *     tiempo constante. NO usa token de usuario (proyectos Firebase distintos).
 *   - El uid se DERIVA del orgId (enverde_<orgId>): el caller no controla uids
 *     crudos → sin colisión con usuarios reales de raizygrano.
 *   - Idempotente: re-provisionar el mismo orgId no duplica nada.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db, adminAuth, FieldValue } from "@/lib/firebase-admin";
import { ensureDefaultAssumptions, upsertAssumption } from "@/lib/treasury/store";

export const runtime = "nodejs"; // firebase-admin + crypto no corren en edge

/** Compara dos strings en tiempo constante (evita timing attacks). */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// slug [a-z0-9-], empieza/termina alfanumérico, 3..64 chars
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  try {
    const secret = process.env.ENVERDE_PROVISION_SECRET;
    if (!secret) {
      console.error("enverde provision: ENVERDE_PROVISION_SECRET no configurado");
      return NextResponse.json({ error: "Provisioning not configured" }, { status: 500 });
    }

    const provided = req.headers.get("x-enverde-secret") ?? "";
    if (!constantTimeEqual(provided, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = String(body.orgId ?? "").trim();
    const orgName = String(body.orgName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const founderName = body.founderName ? String(body.founderName).trim().slice(0, 80) : null;
    const businessType = body.businessType ? String(body.businessType).trim().slice(0, 120) : null;
    const salaryTarget =
      typeof body.salaryTarget === "number" && !isNaN(body.salaryTarget) && body.salaryTarget > 0
        ? Math.round(body.salaryTarget)
        : null;

    if (!SLUG_RE.test(orgId)) {
      return NextResponse.json(
        { error: "orgId inválido (slug [a-z0-9-], 3..64 chars)" },
        { status: 400 }
      );
    }
    if (!orgName || orgName.length > 80) {
      return NextResponse.json({ error: "orgName requerido (1..80 chars)" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "email inválido" }, { status: 400 });
    }

    const uid = `enverde_${orgId}`;

    /* ─── 1) Org + owner (Admin SDK, idempotente) ────────────── */
    const orgRef = db.collection("orgs").doc(orgId);
    await orgRef.set(
      {
        name: orgName,
        founderName,
        email,
        businessType,
        source: "enverde",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await orgRef.collection("members").doc(uid).set(
      {
        role: "owner",
        active: true,
        source: "enverde",
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    // El POS resuelve la org del usuario vía `users/{uid}.orgIds` (no vía members),
    // así que el café necesita AMBOS para operar en brain (members) y POS (orgIds).
    // arrayUnion no pisa otras orgs. NOTA: orgIds es solo selección de org en el POS;
    // el acceso a datos sigue gateado por orgs/{id}/members en las reglas Firestore.
    await db.collection("users").doc(uid).set(
      { uid, orgIds: FieldValue.arrayUnion(orgId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    /* ─── 2) Assumptions por defecto (café-genérico) + target ── */
    await ensureDefaultAssumptions(orgId);
    if (salaryTarget) {
      await upsertAssumption(orgId, "_default", { foundersSalaryTarget: salaryTarget });
    }

    /* ─── 3) Custom token raizygrano para el bridge de identidad ─ */
    const customToken = await adminAuth.createCustomToken(uid, { enverde: true, orgId });

    const next = `/org/${orgId}/treasury/start`;
    const loginUrl =
      `/enverde-login?token=${encodeURIComponent(customToken)}` +
      `&org=${encodeURIComponent(orgId)}&next=${encodeURIComponent(next)}`;

    console.log(
      JSON.stringify({ op: "enverde.provision", orgId, uid, salaryTarget, ts: new Date().toISOString() })
    );

    return NextResponse.json({ ok: true, orgId, uid, customToken, loginUrl });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("enverde provision error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
