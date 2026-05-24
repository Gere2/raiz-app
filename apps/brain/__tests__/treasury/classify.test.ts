/**
 * __tests__/treasury/classify.test.ts
 *
 * Tests del classifier determinista (PR1). Sin Firestore — sólo data y la
 * función pura. Cubre:
 *   - cada categoría seed que pediste en la spec
 *   - amountSign (rechazo de TPV en cargo, AEAT en abono)
 *   - prioridad: TPV > proveedores específicos > genéricos > tarjeta > retirada
 *   - fallbacks needs_review / income_other
 */

import { describe, it, expect } from "vitest";
import {
  classifyMovement,
  classificationToLegacyStatus,
  deriveCashMonth,
} from "../../lib/treasury/classify";
import { SEED_RULES } from "../../lib/treasury/seed-rules";

describe("classifyMovement — proveedores específicos", () => {
  it("Amazon → materia_prima / leche_suministros_amazon / expense_operating", () => {
    const r = classifyMovement(
      { concept: "PAGO AMAZON EU SARL 2026/04/12", amount: -45.5 },
      SEED_RULES
    );
    expect(r.category).toBe("materia_prima");
    expect(r.subcategory).toBe("leche_suministros_amazon");
    expect(r.flowKind).toBe("expense_operating");
    expect(r.classifierSource).toBe("rule:seed_amazon");
    expect(r.ruleVersion).toBe(1);
  });

  it("UFV / Fundación Francisco de Vitoria → suministros / luz_gas", () => {
    const r = classifyMovement(
      { concept: "RECIBO FUND. FCO DE VITORIA SUMINISTROS", amount: -180 },
      SEED_RULES
    );
    expect(r.category).toBe("suministros");
    expect(r.subcategory).toBe("luz_gas");
    expect(r.classifierSource).toBe("rule:seed_ufv");
  });

  it("Anthropic → tecnologia / ia", () => {
    const r = classifyMovement(
      { concept: "ANTHROPIC PBC SUBSCRIPTION", amount: -22 },
      SEED_RULES
    );
    expect(r.category).toBe("tecnologia");
    expect(r.subcategory).toBe("ia");
  });

  it("OpenAI → tecnologia / ia", () => {
    const r = classifyMovement(
      { concept: "OPENAI *CHATGPT SUBSCRIPTION", amount: -20 },
      SEED_RULES
    );
    expect(r.category).toBe("tecnologia");
    expect(r.subcategory).toBe("ia");
  });

  it("Amor Perfecto → materia_prima / cafe", () => {
    const r = classifyMovement(
      { concept: "TRANSF AMOR PERFECTO SL FRA 2026-04", amount: -660 },
      SEED_RULES
    );
    expect(r.category).toBe("materia_prima");
    expect(r.subcategory).toBe("cafe");
    expect(r.supplierName).toBe("Amor Perfecto");
  });

  it("Zumit / Squeeze → materia_prima / zumos_reventa", () => {
    const r = classifyMovement(
      { concept: "PAGO ZUMIT SQUEEZE PROVEEDOR", amount: -340 },
      SEED_RULES
    );
    expect(r.subcategory).toBe("zumos_reventa");
  });

  it("Reimpulsa → servicios / gestoria", () => {
    const r = classifyMovement(
      { concept: "REIMPULSA HONORARIOS ABRIL", amount: -120 },
      SEED_RULES
    );
    expect(r.category).toBe("servicios");
    expect(r.subcategory).toBe("gestoria");
  });

  it("Envapro / Gloop → packaging / consumibles", () => {
    const r = classifyMovement(
      { concept: "PAGO ENVAPRO SL", amount: -85 },
      SEED_RULES
    );
    expect(r.category).toBe("packaging");
    expect(r.subcategory).toBe("consumibles");
  });

  it("Makro → materia_prima / compras_generales", () => {
    const r = classifyMovement(
      { concept: "MAKRO ALCORCON COMPRA", amount: -210 },
      SEED_RULES
    );
    expect(r.subcategory).toBe("compras_generales");
  });

  it("IKEA → equipamiento / revisar (confidence baja a propósito)", () => {
    const r = classifyMovement(
      { concept: "IKEA ALCORCON COMPRA TIENDA", amount: -65 },
      SEED_RULES
    );
    expect(r.category).toBe("equipamiento");
    expect(r.subcategory).toBe("revisar");
    expect(r.confidence).toBeLessThan(0.85);
  });

  it("Uber / Bolt / Cabify → logistica / transporte", () => {
    const uber = classifyMovement(
      { concept: "UBER TRIP MADRID", amount: -12 },
      SEED_RULES
    );
    const bolt = classifyMovement(
      { concept: "BOLT EU UA RIDE", amount: -9 },
      SEED_RULES
    );
    expect(uber.subcategory).toBe("transporte");
    expect(bolt.subcategory).toBe("transporte");
  });
});

describe("classifyMovement — impuestos / SS", () => {
  it("AEAT → impuestos / aeat", () => {
    const r = classifyMovement(
      { concept: "AEAT MODELO 130 AUTOLIQUIDACION", amount: -540 },
      SEED_RULES
    );
    expect(r.category).toBe("impuestos");
    expect(r.subcategory).toBe("aeat");
  });

  it("Seguridad Social / TGSS → personal / autonomo_ss", () => {
    const r = classifyMovement(
      { concept: "TESORERIA GRAL SEG SOCIAL CUOTA", amount: -310 },
      SEED_RULES
    );
    expect(r.category).toBe("personal");
    expect(r.subcategory).toBe("autonomo_ss");
  });

  it("AEAT no matchea si el importe es positivo (devolución no clasificada como impuesto)", () => {
    const r = classifyMovement(
      { concept: "AEAT DEVOLUCION IRPF", amount: 240 },
      SEED_RULES
    );
    expect(r.category).not.toBe("impuestos");
    expect(r.flowKind).toBe("income_other");
  });
});

describe("classifyMovement — TPV income", () => {
  it("REDSYS / liquidación tarjeta → ventas_tpv / income_sales_tpv", () => {
    const r = classifyMovement(
      { concept: "LIQUIDACION TARJETA REDSYS COMERCIO SANTANDER", amount: 380 },
      SEED_RULES
    );
    expect(r.category).toBe("ventas_tpv");
    expect(r.flowKind).toBe("income_sales_tpv");
    expect(r.classifierSource).toBe("rule:seed_tpv_redsys");
  });

  it("REDSYS no matchea si el importe es negativo (devolución TPV)", () => {
    const r = classifyMovement(
      { concept: "REDSYS DEVOLUCION COMERCIO", amount: -15 },
      SEED_RULES
    );
    expect(r.category).not.toBe("ventas_tpv");
  });
});

describe("classifyMovement — tarjetas pendientes y retiradas", () => {
  it("Tarjeta *9415 → tarjeta_pendiente / tarjeta_9415 / card_pending", () => {
    const r = classifyMovement(
      { concept: "PAGO TARJETA *9415 ABRIL 2026", amount: -315.45 },
      SEED_RULES
    );
    expect(r.category).toBe("tarjeta_pendiente");
    expect(r.subcategory).toBe("tarjeta_9415");
    expect(r.flowKind).toBe("card_pending");
  });

  it("Tarjeta *2288 → tarjeta_pendiente / tarjeta_2288 / card_pending", () => {
    const r = classifyMovement(
      { concept: "TARJETA xxxx 2288 LIQUIDACION", amount: -180 },
      SEED_RULES
    );
    expect(r.subcategory).toBe("tarjeta_2288");
    expect(r.flowKind).toBe("card_pending");
  });

  it("Retirada cajero → disposicion_socio / partner_drawing", () => {
    const r = classifyMovement(
      { concept: "RETIRADA EFECTIVO CAJERO 4B", amount: -200 },
      SEED_RULES
    );
    expect(r.category).toBe("disposicion_socio");
    expect(r.flowKind).toBe("partner_drawing");
  });
});

describe("classifyMovement — fallbacks", () => {
  it("gasto desconocido → needs_review con confidence 0", () => {
    const r = classifyMovement(
      { concept: "PAGO RANDOMSHOP SL", amount: -45 },
      SEED_RULES
    );
    expect(r.flowKind).toBe("needs_review");
    expect(r.confidence).toBe(0);
    expect(r.classifierSource).toBe("default");
  });

  it("ingreso desconocido → income_other con confidence baja", () => {
    const r = classifyMovement(
      { concept: "TRANSFERENCIA RECIBIDA UNKNOWN", amount: 100 },
      SEED_RULES
    );
    expect(r.flowKind).toBe("income_other");
    expect(r.classifierSource).toBe("default");
  });

  it("desactivar una regla la saca del pipeline", () => {
    const customRules = SEED_RULES.map((r) =>
      r.id === "seed_amazon" ? { ...r, active: false } : r
    );
    const r = classifyMovement(
      { concept: "AMAZON EU SARL", amount: -45 },
      customRules
    );
    expect(r.flowKind).toBe("needs_review");
  });
});

describe("classificationToLegacyStatus", () => {
  it("default → pending", () => {
    expect(
      classificationToLegacyStatus({
        category: "otros",
        flowKind: "needs_review",
        confidence: 0,
        classifierSource: "default",
        classifierReason: "x",
      })
    ).toBe("pending");
  });

  it("rule con supplierName → matched", () => {
    expect(
      classificationToLegacyStatus({
        category: "tecnologia",
        flowKind: "expense_operating",
        confidence: 0.95,
        classifierSource: "rule:seed_anthropic",
        classifierReason: "x",
        supplierName: "Anthropic",
      })
    ).toBe("matched");
  });

  it("rule sin supplierName → categorized", () => {
    expect(
      classificationToLegacyStatus({
        category: "packaging",
        flowKind: "expense_operating",
        confidence: 0.85,
        classifierSource: "rule:seed_envapro_gloop",
        classifierReason: "x",
      })
    ).toBe("categorized");
  });
});

describe("deriveCashMonth", () => {
  it("YYYY-MM-DD → YYYY-MM", () => {
    expect(deriveCashMonth("2026-04-12")).toBe("2026-04");
  });
  it("string vacío → null", () => {
    expect(deriveCashMonth("")).toBe(null);
    expect(deriveCashMonth(null)).toBe(null);
    expect(deriveCashMonth(undefined)).toBe(null);
  });
  it("formato no soportado → null", () => {
    expect(deriveCashMonth("12/04/2026")).toBe(null);
  });
});
