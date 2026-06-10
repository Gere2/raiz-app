import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth, AuthError, type DecodedToken } from "@/lib/require-auth";

/**
 * GET /api/internal/pilot — agregado READ-ONLY del piloto Enverde.
 *
 * Lista las orgs dadas de alta vía enverde (orgs.source == "enverde", la
 * población del piloto; el alta no persiste utm así que no existe marca
 * "piloto-10-cafes" más fina) y devuelve por org SOLO estados de activación:
 * flags sí/no derivados de orgs/{orgId}/events (tipos ACTIVATION), si hay
 * feedback, fecha de alta y último evento de activación.
 *
 * Privacidad: nunca importes, productos, extractos ni datos personales
 * (ni siquiera email/founderName de la org). Proyección estricta.
 *
 * Acceso: solo equipo interno. Gate propio porque requireAdmin (lib/require-staff)
 * cortocircuita con el claim `staff: true` a rol "employee" y dejaría fuera al
 * admin real cuyo rol vive en `cafe_users`; aquí el claim role=admin O el doc
 * `cafe_users/{email}.role == "admin"` autorizan. Sin token → 401, resto → 403.
 */

const PILOT_EVENT_TYPES = [
  "demo_opened",
  "cta_upload_statement_clicked",
  "cta_products_clicked",
  "cta_recipes_clicked",
  "cta_manual_sales_clicked",
  "cta_pos_clicked",
  "pos_product_linked",
  "profitability_summary_seen",
  "onboarding_step_clicked",
] as const;

const ORGS_LIMIT = 100;
const EVENTS_SCAN = 500;

async function requireInternalAdmin(req: Request): Promise<DecodedToken> {
  const user = await requireAuth(req);
  if (user.role === "admin") return user;

  const email = user.email?.toLowerCase();
  if (email) {
    const snap = await db.collection("cafe_users").doc(email).get();
    if (snap.exists && snap.data()?.role === "admin") return user;
  }
  throw new AuthError("Solo administradores del equipo interno", 403);
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalAdmin(req);

    const orgsSnap = await db
      .collection("orgs")
      .where("source", "==", "enverde")
      .limit(ORGS_LIMIT)
      .get();

    const orgs = await Promise.all(
      orgsSnap.docs.map(async (orgDoc) => {
        const data = orgDoc.data();
        const orgId = orgDoc.id;

        const orgRef = db.collection("orgs").doc(orgId);
        const [eventsSnap, feedbackAgg] = await Promise.all([
          orgRef
            .collection("events")
            .where("type", "in", [...PILOT_EVENT_TYPES])
            .select("type", "timestamp")
            .limit(EVENTS_SCAN)
            .get(),
          orgRef.collection("feedback").count().get(),
        ]);

        const seen = new Set<string>();
        let lastEvent: { type: string; timestamp: string } | null = null;
        for (const d of eventsSnap.docs) {
          const e = d.data();
          const type = typeof e.type === "string" ? e.type : "";
          const ts = typeof e.timestamp === "string" ? e.timestamp : "";
          if (type) seen.add(type);
          if (type && ts && (!lastEvent || ts > lastEvent.timestamp)) {
            lastEvent = { type, timestamp: ts };
          }
        }

        const createdAt =
          typeof data.createdAt?.toDate === "function"
            ? data.createdAt.toDate().toISOString()
            : null;

        return {
          orgId,
          name: typeof data.name === "string" && data.name ? data.name : orgId,
          createdAt,
          demoOpened: seen.has("demo_opened"),
          extractClicked: seen.has("cta_upload_statement_clicked"),
          productsClicked: seen.has("cta_products_clicked") || seen.has("cta_recipes_clicked"),
          manualSalesClicked: seen.has("cta_manual_sales_clicked"),
          summarySeen: seen.has("profitability_summary_seen"),
          feedbackCount: feedbackAgg.data().count,
          lastEvent,
        };
      }),
    );

    // Más recientes primero; orgs sin createdAt al final.
    orgs.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return NextResponse.json({
      orgs,
      count: orgs.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
