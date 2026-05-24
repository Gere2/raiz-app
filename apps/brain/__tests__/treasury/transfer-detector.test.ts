/**
 * Tests del detector de traspasos internos (PR2).
 *
 * Cubren:
 *   - Par claro Santander out / BBVA in mismo día.
 *   - Par con diferencia de 2 días dentro de ventana.
 *   - Sin match si importe no coincide.
 *   - Sin match si misma cuenta.
 *   - Sin match si ningún concepto contiene hint de traspaso.
 *   - Ambiguo si más de un candidato.
 *   - Idempotencia: skip ya emparejados salvo force.
 *   - No pisa classifierSource=manual salvo force.
 *   - Tolerancia ±0,01 €.
 *   - windowDays = 0 fuerza misma fecha.
 */

import { describe, it, expect } from "vitest";
import {
  detectTransfers,
  hasTransferHint,
  dateDeltaDays,
  type DetectorMovement,
} from "../../lib/treasury/transfer-detector";

const m = (over: Partial<DetectorMovement>): DetectorMovement => ({
  id: over.id ?? "x",
  date: over.date ?? "2026-04-01",
  amount: over.amount ?? 0,
  concept: over.concept ?? "",
  accountId: over.accountId ?? "santander_main",
  bank: over.bank ?? "santander",
  flowKind: over.flowKind ?? null,
  classifierSource: over.classifierSource ?? null,
  pairedTransferId: over.pairedTransferId ?? null,
});

describe("hasTransferHint", () => {
  it("detecta keywords de traspaso", () => {
    expect(hasTransferHint("Santander traspaso")).toBe(true);
    expect(hasTransferHint("TRANSFERENCIA RECIBIDA BBVA")).toBe(true);
    expect(hasTransferHint("transf. ord/ pepe perez")).toBe(true);
    expect(hasTransferHint("PROVEEDOR CAFE AMOR PERFECTO")).toBe(false);
    expect(hasTransferHint("AMAZON EU SARL")).toBe(false);
  });
});

describe("dateDeltaDays", () => {
  it("calcula delta en días entre fechas YYYY-MM-DD", () => {
    expect(dateDeltaDays("2026-04-10", "2026-04-08")).toBe(2);
    expect(dateDeltaDays("2026-04-08", "2026-04-10")).toBe(-2);
    expect(dateDeltaDays("2026-04-10", "2026-04-10")).toBe(0);
    expect(dateDeltaDays("2026-03-01", "2026-02-26")).toBe(3);
  });
});

describe("detectTransfers — strong pairs", () => {
  it("detecta par claro Santander out → BBVA in mismo día", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-03-27", amount: -2700, accountId: "santander_main", bank: "santander", concept: "Santander traspaso" }),
      m({ id: "b", date: "2026-03-27", amount: 2700, accountId: "bbva_main", bank: "bbva", concept: "Transferencia recibida" }),
    ]);
    expect(r.strongPairs).toHaveLength(1);
    expect(r.ambiguous).toHaveLength(0);
    const p = r.strongPairs[0];
    expect(p.outMovementId).toBe("a");
    expect(p.inMovementId).toBe("b");
    expect(p.amount).toBe(2700);
    expect(p.subcategory).toBe("santander_bbva");
    expect(p.dateDeltaDays).toBe(0);
    expect(p.hintSource).toBe("both");
    expect(p.confidence).toBe(0.95);
  });

  it("detecta par con 2 días de diferencia dentro de ventana", () => {
    const r = detectTransfers([
      m({ id: "out", date: "2026-04-08", amount: -1000, accountId: "santander_main", bank: "santander", concept: "Traspaso a BBVA" }),
      m({ id: "in", date: "2026-04-10", amount: 1000, accountId: "bbva_main", bank: "bbva", concept: "" }),
    ]);
    expect(r.strongPairs).toHaveLength(1);
    expect(r.strongPairs[0].dateDeltaDays).toBe(2);
    expect(r.strongPairs[0].hintSource).toBe("out");
  });

  it("BBVA out → Santander in genera subcategory bbva_santander", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -500, accountId: "bbva_main", bank: "bbva", concept: "Transferencia a Santander" }),
      m({ id: "b", date: "2026-04-01", amount: 500, accountId: "santander_main", bank: "santander", concept: "" }),
    ]);
    expect(r.strongPairs[0].subcategory).toBe("bbva_santander");
  });

  it("tolerancia ±0,01 € permite redondeos", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100.005, accountId: "santander_main", bank: "santander", concept: "Traspaso" }),
      m({ id: "b", date: "2026-04-01", amount: 100.005, accountId: "bbva_main", bank: "bbva", concept: "" }),
    ]);
    expect(r.strongPairs).toHaveLength(1);
  });
});

describe("detectTransfers — sin match", () => {
  it("no detecta si importes distintos", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "b", date: "2026-04-01", amount: 99, accountId: "bbva_main", concept: "" }),
    ]);
    expect(r.strongPairs).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
  });

  it("no detecta si misma cuenta", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "b", date: "2026-04-01", amount: 100, accountId: "santander_main", concept: "Devolución" }),
    ]);
    expect(r.strongPairs).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
  });

  it("no detecta si fuera de ventana", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso BBVA" }),
      m({ id: "b", date: "2026-04-10", amount: 100, accountId: "bbva_main", concept: "" }),
    ], { windowDays: 3 });
    expect(r.strongPairs).toHaveLength(0);
  });

  it("no detecta si ningún concepto tiene hint de traspaso", () => {
    const r = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Pago proveedor X" }),
      m({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main", concept: "Cobro factura" }),
    ]);
    expect(r.strongPairs).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
  });

  it("windowDays = 0 fuerza misma fecha", () => {
    const r0 = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "b", date: "2026-04-02", amount: 100, accountId: "bbva_main", concept: "" }),
    ], { windowDays: 0 });
    expect(r0.strongPairs).toHaveLength(0);

    const r1 = detectTransfers([
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main", concept: "" }),
    ], { windowDays: 0 });
    expect(r1.strongPairs).toHaveLength(1);
  });
});

describe("detectTransfers — ambiguos", () => {
  it("dos positivos compatibles con un negativo → ambiguo", () => {
    const r = detectTransfers([
      m({ id: "neg", date: "2026-04-01", amount: -200, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "pos1", date: "2026-04-01", amount: 200, accountId: "bbva_main", concept: "" }),
      m({ id: "pos2", date: "2026-04-02", amount: 200, accountId: "bbva_main", concept: "" }),
    ]);
    expect(r.strongPairs).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].movementIds.sort()).toEqual(["neg", "pos1", "pos2"]);
    expect(r.ambiguous[0].amount).toBe(200);
  });

  it("dos negativos compitiendo por un positivo → ambiguo", () => {
    const r = detectTransfers([
      m({ id: "neg1", date: "2026-04-01", amount: -300, accountId: "santander_main", concept: "Traspaso" }),
      m({ id: "neg2", date: "2026-04-01", amount: -300, accountId: "santander_main", concept: "Transferencia" }),
      m({ id: "pos", date: "2026-04-01", amount: 300, accountId: "bbva_main", concept: "" }),
    ]);
    expect(r.strongPairs).toHaveLength(0);
    expect(r.ambiguous[0].movementIds.sort()).toEqual(["neg1", "neg2", "pos"]);
  });
});

describe("detectTransfers — idempotencia y manual", () => {
  it("ya emparejado → skip salvo force", () => {
    const movs = [
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso", flowKind: "internal_transfer", pairedTransferId: "b" }),
      m({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main", concept: "", flowKind: "internal_transfer", pairedTransferId: "a" }),
    ];
    const r = detectTransfers(movs);
    expect(r.strongPairs).toHaveLength(0);

    const rForce = detectTransfers(movs, { force: true });
    expect(rForce.strongPairs).toHaveLength(1);
  });

  it("classifierSource = manual → skip salvo force", () => {
    const movs = [
      m({ id: "a", date: "2026-04-01", amount: -100, accountId: "santander_main", concept: "Traspaso", classifierSource: "manual" }),
      m({ id: "b", date: "2026-04-01", amount: 100, accountId: "bbva_main", concept: "", classifierSource: null }),
    ];
    expect(detectTransfers(movs).strongPairs).toHaveLength(0);
    expect(detectTransfers(movs, { force: true }).strongPairs).toHaveLength(1);
  });
});
