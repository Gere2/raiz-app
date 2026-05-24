/**
 * lib/treasury/transfer-detector.ts
 *
 * Detector de traspasos internos entre cuentas propias (PR2).
 *
 * Función PURA. No toca Firestore. Recibe un array de movimientos y devuelve:
 *   - strongPairs: pares con match único, listos para aplicar (confidence 0.95).
 *   - ambiguous:   grupos donde varios movimientos comparten importe en la
 *                  ventana — necesitan revisión manual.
 *
 * Reglas para considerar un par válido:
 *   1. Importe absoluto coincidente (tolerancia ±0,01 €).
 *   2. Signos opuestos (uno negativo, uno positivo).
 *   3. accountId distintos.
 *   4. Diferencia de fechas ≤ windowDays (default 3, configurable).
 *   5. Al menos uno de los dos conceptos contiene un "hint" de traspaso
 *      (transferencia, traspaso, transfer, santander, bbva, …).
 *
 * Filtros de elegibilidad (no se vuelven a emparejar):
 *   - Movimientos ya marcados internal_transfer con pairedTransferId.
 *   - classifierSource = "manual" (correcciones humanas).
 *   - Ambos saltables si options.force = true.
 *
 * Mentalidad CFO: ante duda, no tocar. Mejor flagar como ambiguo y dejar que
 * el operador decida que clasificar mal un traspaso como ingreso/gasto.
 */

import type { TreasuryBank } from "./types";

export type DetectorMovement = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  concept?: string | null;
  accountId: string;
  bank?: TreasuryBank | string | null;
  flowKind?: string | null;
  classifierSource?: string | null;
  pairedTransferId?: string | null;
};

export type DetectedPair = {
  outMovementId: string;
  inMovementId: string;
  amount: number; // positivo
  outDate: string;
  inDate: string;
  outAccountId: string;
  inAccountId: string;
  outBank: string;
  inBank: string;
  subcategory: string; // "santander_bbva" | "bbva_santander" | …
  dateDeltaDays: number;
  reason: string;
  confidence: number;
  hintSource: "out" | "in" | "both";
};

export type AmbiguousGroup = {
  movementIds: string[];
  amount: number;
  reason: string;
};

export type DetectResult = {
  strongPairs: DetectedPair[];
  ambiguous: AmbiguousGroup[];
};

export type DetectOptions = {
  windowDays?: number;
  force?: boolean;
};

/* ─── Hints léxicos ─────────────────────────────────────────── */

const TRANSFER_HINT_REGEX = new RegExp(
  [
    "\\btransferencia\\b",
    "\\btransferenc",
    "\\btraspaso\\b",
    "\\btransfer\\b",
    "\\btransf\\.?\\b",
    "\\btranf\\.?\\b",
    "ingreso\\s+transferencia",
    "transferencia\\s+(recibida|emitida|enviada)",
    "\\bord/",
    "\\bord:",
    "\\bsantander\\b",
    "\\bbbva\\b",
  ].join("|"),
  "i"
);

export function hasTransferHint(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return TRANSFER_HINT_REGEX.test(String(concept));
}

/* ─── Aritmética de fechas ──────────────────────────────────── */

export function dateDeltaDays(a: string, b: string): number {
  const da = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10))
  );
  const dbu = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10))
  );
  return Math.round((da - dbu) / 86_400_000);
}

/* ─── Núcleo del detector ───────────────────────────────────── */

export function detectTransfers(
  movements: DetectorMovement[],
  options: DetectOptions = {}
): DetectResult {
  const windowDays = Math.max(0, options.windowDays ?? 3);
  const force = options.force === true;

  // 1) Elegibilidad
  const eligible = movements.filter((m) => {
    if (!m.id || !m.accountId) return false;
    if (!m.amount || Math.abs(m.amount) < 0.005) return false;
    if (
      !force &&
      m.flowKind === "internal_transfer" &&
      m.pairedTransferId
    ) return false;
    if (!force && m.classifierSource === "manual") return false;
    return true;
  });

  // 2) Bucket por importe absoluto (en céntimos para evitar float drift)
  const byAmount = new Map<number, { neg: DetectorMovement[]; pos: DetectorMovement[] }>();
  for (const m of eligible) {
    const key = Math.round(Math.abs(m.amount) * 100);
    let bucket = byAmount.get(key);
    if (!bucket) {
      bucket = { neg: [], pos: [] };
      byAmount.set(key, bucket);
    }
    if (m.amount < 0) bucket.neg.push(m);
    else bucket.pos.push(m);
  }

  // 3) Aristas candidatas
  type Edge = {
    neg: DetectorMovement;
    pos: DetectorMovement;
    dateDeltaDays: number;
    hintNeg: boolean;
    hintPos: boolean;
  };
  const edges: Edge[] = [];

  for (const [, bucket] of byAmount) {
    if (bucket.neg.length === 0 || bucket.pos.length === 0) continue;
    for (const neg of bucket.neg) {
      for (const pos of bucket.pos) {
        if (neg.accountId === pos.accountId) continue;
        // Tolerancia ±0,01 € (ya garantizada por el bucket en céntimos)
        const delta = Math.abs(neg.amount + pos.amount);
        if (delta > 0.01) continue;
        const dd = dateDeltaDays(pos.date, neg.date);
        if (Math.abs(dd) > windowDays) continue;
        const hintNeg = hasTransferHint(neg.concept);
        const hintPos = hasTransferHint(pos.concept);
        if (!hintNeg && !hintPos) continue;
        edges.push({ neg, pos, dateDeltaDays: dd, hintNeg, hintPos });
      }
    }
  }

  // 4) Grado de cada nodo
  const negDeg = new Map<string, number>();
  const posDeg = new Map<string, number>();
  for (const e of edges) {
    negDeg.set(e.neg.id, (negDeg.get(e.neg.id) ?? 0) + 1);
    posDeg.set(e.pos.id, (posDeg.get(e.pos.id) ?? 0) + 1);
  }

  // 5) Strong pairs (degree 1 en ambos lados) y ambiguos (resto)
  const strongPairs: DetectedPair[] = [];
  const ambiguousIds = new Set<string>();
  const ambiguousAmount = new Map<string, number>();

  for (const e of edges) {
    const nDeg = negDeg.get(e.neg.id)!;
    const pDeg = posDeg.get(e.pos.id)!;
    const amount = Math.abs(e.neg.amount);

    if (nDeg === 1 && pDeg === 1) {
      const hintSource: DetectedPair["hintSource"] =
        e.hintNeg && e.hintPos ? "both" : e.hintNeg ? "out" : "in";
      const outBank = String(e.neg.bank ?? "other");
      const inBank = String(e.pos.bank ?? "other");
      const subcategory = `${outBank}_${inBank}`;
      const reason = buildReason({
        amount,
        outAccount: e.neg.accountId,
        inAccount: e.pos.accountId,
        dateDelta: e.dateDeltaDays,
        hintSource,
      });
      strongPairs.push({
        outMovementId: e.neg.id,
        inMovementId: e.pos.id,
        amount,
        outDate: e.neg.date,
        inDate: e.pos.date,
        outAccountId: e.neg.accountId,
        inAccountId: e.pos.accountId,
        outBank,
        inBank,
        subcategory,
        dateDeltaDays: e.dateDeltaDays,
        reason,
        confidence: 0.95,
        hintSource,
      });
    } else {
      ambiguousIds.add(e.neg.id);
      ambiguousIds.add(e.pos.id);
      ambiguousAmount.set(e.neg.id, amount);
      ambiguousAmount.set(e.pos.id, amount);
    }
  }

  // Agrupa ambiguos por importe para el reporte
  const ambiguousByAmount = new Map<number, string[]>();
  for (const id of ambiguousIds) {
    const amt = ambiguousAmount.get(id)!;
    let arr = ambiguousByAmount.get(amt);
    if (!arr) {
      arr = [];
      ambiguousByAmount.set(amt, arr);
    }
    arr.push(id);
  }
  const ambiguous: AmbiguousGroup[] = [];
  for (const [amt, ids] of ambiguousByAmount) {
    ambiguous.push({
      movementIds: ids.sort(),
      amount: amt,
      reason: `${ids.length} movimientos comparten importe ${amt.toFixed(2)} € en ventana de ${windowDays} día(s) entre cuentas propias — requiere revisión manual.`,
    });
  }

  return { strongPairs, ambiguous };
}

function buildReason(args: {
  amount: number;
  outAccount: string;
  inAccount: string;
  dateDelta: number;
  hintSource: DetectedPair["hintSource"];
}): string {
  const dd = Math.abs(args.dateDelta);
  const dayText = dd === 0 ? "el mismo día" : `${dd} día(s) de diferencia`;
  const hint =
    args.hintSource === "both"
      ? "ambos conceptos mencionan traspaso"
      : args.hintSource === "out"
        ? "el concepto de la salida menciona traspaso"
        : "el concepto del ingreso menciona traspaso";
  return `Importe ${args.amount.toFixed(2)} € coincide entre ${args.outAccount} y ${args.inAccount} con ${dayText}; ${hint}.`;
}

/* ─── Helpers expuestos para tests ──────────────────────────── */
export const __test = { hasTransferHint, dateDeltaDays };
