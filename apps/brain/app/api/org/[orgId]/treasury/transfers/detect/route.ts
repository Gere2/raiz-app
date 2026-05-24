import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import {
  detectTransfers,
  type AmbiguousGroup,
  type DetectedPair,
  type DetectorMovement,
} from "@/lib/treasury/transfer-detector";

type Params = { params: Promise<{ orgId: string }> };

const BATCH_CHUNK = 400;

/**
 * POST /api/org/[orgId]/treasury/transfers/detect
 *
 * Detecta traspasos internos entre cuentas propias y los marca como
 * internal_transfer / traspaso_interno / pairedTransferId. Idempotente.
 *
 * Body:
 *   {
 *     month?: "2026-04",
 *     from?:  "2026-01-01",
 *     to?:    "2026-04-30",
 *     windowDays?: 3,         // default 3, [0..30]
 *     dryRun?: true,          // no escribe
 *     force?:  true,          // pisa pares previos y manuals
 *     limit?: 1000            // max movimientos a cargar [1..5000]
 *   }
 *
 * Comportamiento:
 *   - Carga movimientos en [from-windowDays, to+windowDays] (para coger
 *     pares que cruzan el límite del rango).
 *   - Sólo aplica los pares cuyo al menos un extremo cae dentro de [from,to].
 *   - Strong pairs (match único): se actualizan ambos lados.
 *   - Ambiguous: se añade flag "transfer_candidate", confidence 0.4,
 *     status "pending" — sin tocar flowKind/category de PR1.
 *   - classifierSource = "detector:internal_transfer".
 *   - Movimientos ya emparejados o classifierSource=manual: skip salvo force.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const body = await req.json().catch(() => ({}));

    const range = resolveRange(body);
    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }
    const { from, to } = range;

    const windowDays = clamp(body.windowDays ?? 3, 0, 30);
    const dryRun = body.dryRun === true;
    const force = body.force === true;
    const limit = clamp(body.limit ?? 1000, 1, 5000);

    const expandedFrom = shiftDays(from, -windowDays);
    const expandedTo = shiftDays(to, windowDays);

    const snap = await db
      .collection("orgs")
      .doc(orgId)
      .collection("bank_movements")
      .where("date", ">=", expandedFrom)
      .where("date", "<=", expandedTo)
      .limit(limit)
      .get();

    const movements: DetectorMovement[] = snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        date: String(x.date ?? ""),
        amount: Number(x.amount) || 0,
        concept: (x.concept as string) ?? null,
        accountId: String(x.accountId ?? ""),
        bank: (x.bank as string) ?? null,
        flowKind: (x.flowKind as string) ?? null,
        classifierSource: (x.classifierSource as string) ?? null,
        pairedTransferId: (x.pairedTransferId as string) ?? null,
      };
    });

    const result = detectTransfers(movements, { windowDays, force });

    // Filtra a pares con al menos un extremo dentro del rango pedido
    const inRange = (date: string) => date >= from && date <= to;
    const filteredPairs: DetectedPair[] = result.strongPairs.filter(
      (p) => inRange(p.outDate) || inRange(p.inDate)
    );

    const idDateMap = new Map<string, string>();
    for (const m of movements) idDateMap.set(m.id, m.date);

    const filteredAmbiguous: AmbiguousGroup[] = result.ambiguous.filter((a) =>
      a.movementIds.some((id) => {
        const d = idDateMap.get(id);
        return d ? inRange(d) : false;
      })
    );

    /* ─── Escribir actualizaciones ─────────────────────────── */
    let updated = 0;
    if (!dryRun && (filteredPairs.length > 0 || filteredAmbiguous.length > 0)) {
      const ops: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const p of filteredPairs) {
        const common = {
          flowKind: "internal_transfer",
          category: "traspaso_interno",
          subcategory: p.subcategory,
          classifierSource: "detector:internal_transfer",
          classifierReason: p.reason,
          confidence: p.confidence,
          ruleVersion: 1,
          status: "matched",
          updatedAt: FieldValue.serverTimestamp(),
        };
        ops.push({
          id: p.outMovementId,
          data: { ...common, pairedTransferId: p.inMovementId },
        });
        ops.push({
          id: p.inMovementId,
          data: { ...common, pairedTransferId: p.outMovementId },
        });
      }

      for (const a of filteredAmbiguous) {
        for (const id of a.movementIds) {
          ops.push({
            id,
            data: {
              flags: FieldValue.arrayUnion("transfer_candidate"),
              status: "pending",
              transferAmbiguousReason: a.reason,
              updatedAt: FieldValue.serverTimestamp(),
            },
          });
        }
      }

      for (let i = 0; i < ops.length; i += BATCH_CHUNK) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + BATCH_CHUNK)) {
          const ref = db
            .collection("orgs")
            .doc(orgId)
            .collection("bank_movements")
            .doc(op.id);
          batch.update(ref, op.data);
        }
        await batch.commit();
      }
      updated = ops.length;
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      range: { from, to, expandedFrom, expandedTo, windowDays },
      pairsDetected: filteredPairs.length,
      ambiguousCandidates: filteredAmbiguous.length,
      updated,
      pairs: filteredPairs.slice(0, 50),
      ambiguous: filteredAmbiguous.slice(0, 50),
      totalMovementsScanned: movements.length,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury transfers/detect error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/* ─── Helpers ────────────────────────────────────────────────── */

function resolveRange(
  body: { month?: unknown; from?: unknown; to?: unknown }
): { from: string; to: string } | { error: string } {
  const month = typeof body.month === "string" ? body.month : undefined;
  let from = typeof body.from === "string" ? body.from : undefined;
  let to = typeof body.to === "string" ? body.to : undefined;

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { error: "Formato de 'month' inválido. Usa YYYY-MM." };
    }
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    from = `${month}-01`;
    to = `${month}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!from || !to) {
    return { error: "Falta 'month' o 'from'/'to' en el body." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "Formato de 'from'/'to' inválido. Usa YYYY-MM-DD." };
  }
  if (from > to) {
    return { error: "'from' debe ser ≤ 'to'." };
  }
  return { from, to };
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Number(n) || min, min), max);
}
