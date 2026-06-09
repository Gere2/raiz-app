import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import { ACTIVATION_EVENTS, type ActivationEventType } from "@/lib/event-types";

/**
 * GET /api/org/[orgId]/activation-summary — agregado READ-ONLY del tracking
 * de activación del hub (orgs/{orgId}/events, tipos ACTIVATION_EVENTS).
 *
 * Privacidad: devuelve solo counts, tipos, fechas y metadata segura
 * (surface/step/state) — proyección estricta, nunca el `data` completo del
 * evento ni nada de loyalty/gamificación. Org-scoped con requireOrgMember;
 * la vista que lo consume no tiene link público.
 *
 * Sin índices compuestos: counts = count() con filtro de un solo campo;
 * "últimos eventos" = orderBy(timestamp) y filtro a la allowlist en memoria
 * (escaneo acotado: si la org tuviera mucho tráfico no-activación, el
 * recorte es aceptable para señales internas).
 */

type Params = { params: Promise<{ orgId: string }> };

const RECENT_SCAN = 200;
const RECENT_LIMIT = 20;
const STEPS_SCAN = 500;

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const eventsCol = db.collection("orgs").doc(orgId).collection("events");
    const types = Object.keys(ACTIVATION_EVENTS) as ActivationEventType[];

    const counts = await Promise.all(
      types.map(async (t) => {
        const agg = await eventsCol.where("type", "==", t).count().get();
        return [t, agg.data().count] as const;
      }),
    );
    const totals = Object.fromEntries(counts) as Record<ActivationEventType, number>;

    const stepsSnap = await eventsCol.where("type", "==", "onboarding_step_clicked").limit(STEPS_SCAN).get();
    const stepCounts: Record<number, number> = {};
    for (const d of stepsSnap.docs) {
      const step = Number((d.data().data as Record<string, unknown> | undefined)?.step);
      if (Number.isInteger(step) && step >= 1 && step <= 10) stepCounts[step] = (stepCounts[step] || 0) + 1;
    }
    const onboardingSteps = Object.entries(stepCounts)
      .map(([step, count]) => ({ step: Number(step), count }))
      .sort((a, b) => b.count - a.count);

    const recentSnap = await eventsCol.orderBy("timestamp", "desc").limit(RECENT_SCAN).get();
    const recent = recentSnap.docs
      .map((d) => d.data())
      .filter((e) => typeof e.type === "string" && e.type in ACTIVATION_EVENTS)
      .slice(0, RECENT_LIMIT)
      .map((e) => {
        const md = (e.data ?? {}) as Record<string, unknown>;
        return {
          type: e.type as string,
          timestamp: typeof e.timestamp === "string" ? e.timestamp : null,
          surface: typeof md.surface === "string" ? md.surface : null,
          step: typeof md.step === "number" ? md.step : null,
          state: typeof md.state === "string" ? md.state : null,
        };
      });

    const totalEvents = Object.values(totals).reduce((a, b) => a + b, 0);
    return NextResponse.json({ totals, onboardingSteps, recent, totalEvents });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
