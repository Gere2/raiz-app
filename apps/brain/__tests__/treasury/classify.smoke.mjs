/**
 * Smoke test del classifier sin Vitest — corre con jiti.
 *   cd apps/brain && node --import jiti/register __tests__/treasury/classify.smoke.mjs
 *
 * Existe porque el binding nativo de rolldown@rc en este workspace impide
 * arrancar Vitest 4. Cuando se reinstale node_modules con la versión correcta
 * de rolldown, los mismos casos viven en classify.test.ts y se ejecutan ahí.
 */

import { classifyMovement, classificationToLegacyStatus, deriveCashMonth }
  from "../../lib/treasury/classify.ts";
import { SEED_RULES } from "../../lib/treasury/seed-rules.ts";

let failed = 0;
let passed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (detail) console.log(`      ${JSON.stringify(detail)}`);
  }
}

console.log("\nclassifyMovement — proveedores específicos");
{
  const r = classifyMovement({ concept: "PAGO AMAZON EU SARL", amount: -45.5 }, SEED_RULES);
  check("Amazon → materia_prima/leche_suministros_amazon",
    r.category === "materia_prima" && r.subcategory === "leche_suministros_amazon" && r.flowKind === "expense_operating", r);
}
{
  const r = classifyMovement({ concept: "RECIBO FUND. FCO DE VITORIA SUMINISTROS", amount: -180 }, SEED_RULES);
  check("UFV → suministros/luz_gas",
    r.category === "suministros" && r.subcategory === "luz_gas", r);
}
{
  const r = classifyMovement({ concept: "ANTHROPIC PBC SUBSCRIPTION", amount: -22 }, SEED_RULES);
  check("Anthropic → tecnologia/ia",
    r.category === "tecnologia" && r.subcategory === "ia", r);
}
{
  const r = classifyMovement({ concept: "OPENAI *CHATGPT", amount: -20 }, SEED_RULES);
  check("OpenAI → tecnologia/ia",
    r.category === "tecnologia" && r.subcategory === "ia", r);
}
{
  const r = classifyMovement({ concept: "TRANSF AMOR PERFECTO SL FRA 2026-04", amount: -660 }, SEED_RULES);
  check("Amor Perfecto → materia_prima/cafe + supplier",
    r.category === "materia_prima" && r.subcategory === "cafe" && r.supplierName === "Amor Perfecto", r);
}
{
  const r = classifyMovement({ concept: "PAGO ZUMIT SQUEEZE PROVEEDOR", amount: -340 }, SEED_RULES);
  check("Zumit → zumos_reventa", r.subcategory === "zumos_reventa", r);
}
{
  const r = classifyMovement({ concept: "REIMPULSA HONORARIOS", amount: -120 }, SEED_RULES);
  check("Reimpulsa → servicios/gestoria",
    r.category === "servicios" && r.subcategory === "gestoria", r);
}
{
  const r = classifyMovement({ concept: "PAGO ENVAPRO SL", amount: -85 }, SEED_RULES);
  check("Envapro → packaging/consumibles",
    r.category === "packaging" && r.subcategory === "consumibles", r);
}
{
  const r = classifyMovement({ concept: "MAKRO ALCORCON COMPRA", amount: -210 }, SEED_RULES);
  check("Makro → compras_generales", r.subcategory === "compras_generales", r);
}
{
  const r = classifyMovement({ concept: "IKEA ALCORCON COMPRA", amount: -65 }, SEED_RULES);
  check("IKEA → equipamiento/revisar (low conf)",
    r.category === "equipamiento" && r.subcategory === "revisar" && r.confidence < 0.85, r);
}
{
  const r1 = classifyMovement({ concept: "UBER TRIP MADRID", amount: -12 }, SEED_RULES);
  const r2 = classifyMovement({ concept: "BOLT EU UA RIDE", amount: -9 }, SEED_RULES);
  check("Uber/Bolt → logistica/transporte",
    r1.subcategory === "transporte" && r2.subcategory === "transporte", { r1, r2 });
}

console.log("\nclassifyMovement — impuestos / SS / TPV");
{
  const r = classifyMovement({ concept: "AEAT MODELO 130 AUTOLIQUIDACION", amount: -540 }, SEED_RULES);
  check("AEAT → impuestos/aeat",
    r.category === "impuestos" && r.subcategory === "aeat", r);
}
{
  const r = classifyMovement({ concept: "TESORERIA GRAL SEG SOCIAL CUOTA", amount: -310 }, SEED_RULES);
  check("Seguridad Social → personal/autonomo_ss",
    r.category === "personal" && r.subcategory === "autonomo_ss", r);
}
{
  const r = classifyMovement({ concept: "AEAT DEVOLUCION IRPF", amount: 240 }, SEED_RULES);
  check("AEAT con importe positivo NO matchea (devolución)",
    r.category !== "impuestos" && r.flowKind === "income_other", r);
}
{
  const r = classifyMovement({ concept: "LIQUIDACION TARJETA REDSYS COMERCIO SANTANDER", amount: 380 }, SEED_RULES);
  check("REDSYS positivo → ventas_tpv/income_sales_tpv",
    r.category === "ventas_tpv" && r.flowKind === "income_sales_tpv", r);
}
{
  const r = classifyMovement({ concept: "REDSYS DEVOLUCION COMERCIO", amount: -15 }, SEED_RULES);
  check("REDSYS negativo NO se clasifica como ventas_tpv",
    r.category !== "ventas_tpv", r);
}

console.log("\nclassifyMovement — tarjetas / retiradas");
{
  const r = classifyMovement({ concept: "PAGO TARJETA *9415 ABRIL 2026", amount: -315.45 }, SEED_RULES);
  check("Tarjeta *9415 → tarjeta_pendiente/tarjeta_9415/card_pending",
    r.category === "tarjeta_pendiente" && r.subcategory === "tarjeta_9415" && r.flowKind === "card_pending", r);
}
{
  const r = classifyMovement({ concept: "TARJETA xxxx 2288 LIQUIDACION", amount: -180 }, SEED_RULES);
  check("Tarjeta *2288 → tarjeta_2288/card_pending",
    r.subcategory === "tarjeta_2288" && r.flowKind === "card_pending", r);
}
{
  const r = classifyMovement({ concept: "RETIRADA EFECTIVO CAJERO 4B", amount: -200 }, SEED_RULES);
  check("Retirada → disposicion_socio/partner_drawing",
    r.category === "disposicion_socio" && r.flowKind === "partner_drawing", r);
}

console.log("\nclassifyMovement — fallbacks");
{
  const r = classifyMovement({ concept: "PAGO RANDOMSHOP SL", amount: -45 }, SEED_RULES);
  check("Gasto desconocido → needs_review/conf 0",
    r.flowKind === "needs_review" && r.confidence === 0 && r.classifierSource === "default", r);
}
{
  const r = classifyMovement({ concept: "TRANSFERENCIA RECIBIDA UNKNOWN", amount: 100 }, SEED_RULES);
  check("Ingreso desconocido → income_other",
    r.flowKind === "income_other" && r.classifierSource === "default", r);
}
{
  const customRules = SEED_RULES.map((r) => r.id === "seed_amazon" ? { ...r, active: false } : r);
  const r = classifyMovement({ concept: "AMAZON EU SARL", amount: -45 }, customRules);
  check("Regla desactivada se ignora",
    r.flowKind === "needs_review", r);
}

console.log("\nclassificationToLegacyStatus");
{
  check("default → pending",
    classificationToLegacyStatus({ category: "otros", flowKind: "needs_review", confidence: 0, classifierSource: "default", classifierReason: "x" }) === "pending");
  check("rule + supplier → matched",
    classificationToLegacyStatus({ category: "tecnologia", flowKind: "expense_operating", confidence: 0.95, classifierSource: "rule:seed_anthropic", classifierReason: "x", supplierName: "Anthropic" }) === "matched");
  check("rule sin supplier → categorized",
    classificationToLegacyStatus({ category: "packaging", flowKind: "expense_operating", confidence: 0.85, classifierSource: "rule:seed_envapro_gloop", classifierReason: "x" }) === "categorized");
}

console.log("\nderiveCashMonth");
{
  check("YYYY-MM-DD → YYYY-MM", deriveCashMonth("2026-04-12") === "2026-04");
  check("vacío → null", deriveCashMonth("") === null);
  check("null → null", deriveCashMonth(null) === null);
  check("formato no soportado → null", deriveCashMonth("12/04/2026") === null);
}

console.log(`\n${passed} pass · ${failed} fail`);
process.exit(failed > 0 ? 1 : 0);
