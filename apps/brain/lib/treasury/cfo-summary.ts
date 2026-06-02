/**
 * lib/treasury/cfo-summary.ts
 *
 * Genera un resumen narrativo CFO/CEO en lenguaje natural (PR8) a partir
 * de un MonthlySnapshot ya calculado. Usa Claude API directamente con
 * prompt caching para reducir coste/latencia (el system prompt es estable).
 *
 * Devuelve los 7 bloques que pidió la spec:
 *   - quePaso              (qué pasó este mes)
 *   - porquePaso           (por qué)
 *   - queBien              (qué está bien)
 *   - quePreocupa          (qué preocupa)
 *   - queDecision          (qué decisión tomar)
 *   - sueldoGeremi         (cuánto puede cobrar Geremi)
 *   - queFaltaVerde        (qué falta para que el mes sea verde con sueldo objetivo)
 *
 * Mentalidad: lectura honesta. Sin maquillar, sin inflar, sin minimizar.
 * Cada bloque debe ser 1-3 frases concisas.
 */

import type { MonthlySnapshot } from "./monthly-aggregator";

export const CFO_SUMMARY_VERSION = 1;
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export type CFOSummaryBlocks = {
  quePaso: string;
  porquePaso: string;
  queBien: string;
  quePreocupa: string;
  queDecision: string;
  sueldoGeremi: string;
  queFaltaVerde: string;
};

export type CFOSummary = {
  monthId: string;
  generatedAt: string;
  model: string;
  version: number;
  scenarioHashAtGeneration: string;
  blocks: CFOSummaryBlocks;
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
};

const SYSTEM_PROMPT = `Eres el CFO operativo de Raíz y Grano, un food truck / cafetería de especialidad en el campus universitario de la UFV (Universidad Francisco de Vitoria, Madrid). El fundador es Geremi, que opera el negocio día a día.

Tu trabajo este turno: leer un snapshot financiero mensual ya calculado por nuestro sistema (Treasury Truth Layer) y devolver una interpretación narrativa en 7 bloques. La interpretación debe ser HONESTA. No maquillas, no inflas, no minimizas. Si las ventas suben pero la caja se hunde por costes acumulados, lo dices. Si Geremi se puede pagar 1.500 € con holgura, lo dices con cifras. Si no, también.

REGLAS DE ESCRITURA:
- Cada bloque es 1-3 frases máximo, en español castellano natural y directo.
- Nunca uses emojis ni viñetas dentro de los bloques.
- Nombra cifras concretas (€, %) — no abstractas.
- Si un dato falta o es ambiguo, dilo (ej. "el food cost real depende de desglosar las tarjetas pendientes").
- Tutea al fundador. Geremi es la persona, no "el fundador".
- "Verde / amarillo / rojo" se refiere al semáforo del mes con un sueldo aplicado.

CONTEXTO FIJO QUE NO DEBES OLVIDAR:
- TPV (datáfono) liquida en Santander con conceptos tipo "Liquidacion Efectuada El X A Raiz Y Grano".
- BBVA es la cuenta operativa donde se cargan tarjetas, transferencias, AEAT, SS, Amazon, café, etc.
- El IBAN BBVA termina en 4850; el IBAN Santander termina en 8859. La sociedad titular es Eurosirius SL.
- Tarjetas BBVA "9415" y "2288" se liquidan en bloque al final del mes y necesitan extracto detallado para saber qué se compró con ellas — hasta entonces no entran como gasto operativo definitivo.
- Sueldo Geremi: el sistema imputa por defecto 1.000 €/mes. El usuario puede sobrescribir por mes.
- Food cost objetivo: 30 %. Alerta: 30-40 %. Peligro: > 40 %.
- Margen bruto objetivo: 70 % sobre TPV.
- Si la caja es negativa pero el económico positivo, suele significar que pagaste cuotas fiscales trimestrales acumuladas o tarjetas en bloque ese mes.
- Si el económico es negativo pero la caja positiva, suele significar que aplazaste pagos (accruals pendientes, facturas sin pagar) — el banco está ok pero el negocio está perdiendo.

OUTPUT: SOLO JSON válido, sin markdown, sin comentarios, con esta forma exacta:
{
  "quePaso": "...",
  "porquePaso": "...",
  "queBien": "...",
  "quePreocupa": "...",
  "queDecision": "...",
  "sueldoGeremi": "...",
  "queFaltaVerde": "..."
}`;

/* ─── Perfil de negocio (des-Raíz-ificación, T2) ─────────────
 *
 * SYSTEM_PROMPT (arriba) es el prompt LEGACY de Raíz y Grano y se mantiene
 * byte-idéntico: es el default cuando no llega `profile` (preserva el
 * comportamiento y el prompt-cache de Raíz). Las orgs de enverde pasan un
 * CFOProfile y obtienen un prompt parametrizado vía buildSystemPrompt().
 */
export type CFOProfile = {
  businessName: string; // p. ej. "Café Luna"
  businessDescription: string; // p. ej. "una cafetería de especialidad"
  founderName: string; // p. ej. "Marta"
  currency: string; // p. ej. "€"
  defaultSalary: number; // foundersSalary
  salaryTarget: number; // foundersSalaryTarget
  foodCostTarget: number; // 0..1 (0.30)
  foodCostUpper: number; // 0..1 (0.40)
  grossMarginTarget: number; // 0..1 (0.70)
};

export function buildSystemPrompt(p: CFOProfile): string {
  const fcTarget = Math.round(p.foodCostTarget * 100);
  const fcUpper = Math.round(p.foodCostUpper * 100);
  const gm = Math.round(p.grossMarginTarget * 100);
  return `Eres el CFO operativo de ${p.businessName}, ${p.businessDescription}. El fundador es ${p.founderName}, que opera el negocio día a día.

Tu trabajo este turno: leer un snapshot financiero mensual ya calculado por nuestro sistema (Treasury Truth Layer) y devolver una interpretación narrativa en 7 bloques. La interpretación debe ser HONESTA. No maquillas, no inflas, no minimizas. Si las ventas suben pero la caja se hunde por costes acumulados, lo dices. Si ${p.founderName} se puede pagar el sueldo objetivo con holgura, lo dices con cifras. Si no, también.

REGLAS DE ESCRITURA:
- Cada bloque es 1-3 frases máximo, en español castellano natural y directo.
- Nunca uses emojis ni viñetas dentro de los bloques.
- Nombra cifras concretas (${p.currency}, %) — no abstractas.
- Si un dato falta o es ambiguo, dilo (ej. "el food cost real depende de desglosar las tarjetas pendientes").
- Tutea al fundador. ${p.founderName} es la persona, no "el fundador".
- "Verde / amarillo / rojo" se refiere al semáforo del mes con un sueldo aplicado.
- El campo JSON "sueldoGeremi" se refiere a cuánto puede cobrar ${p.founderName} este mes (el nombre del campo es heredado del sistema; no lo cambies, pero su contenido es sobre ${p.founderName}).

CONTEXTO FIJO QUE NO DEBES OLVIDAR:
- El TPV (datáfono) liquida las ventas con tarjeta en la cuenta bancaria, normalmente agregadas por día o por lote.
- La cuenta operativa es donde se cargan compras a proveedores, transferencias, impuestos (AEAT), Seguridad Social, suministros, tecnología, etc.
- Las tarjetas de empresa suelen liquidarse en bloque a fin de mes y necesitan el extracto detallado para imputar cada compra — hasta entonces no entran como gasto operativo definitivo.
- Sueldo de ${p.founderName}: el sistema imputa por defecto ${p.defaultSalary} ${p.currency}/mes y el usuario puede sobrescribir por mes. Sueldo objetivo actual: ${p.salaryTarget} ${p.currency}.
- Food cost objetivo: ${fcTarget} %. Alerta: ${fcTarget}-${fcUpper} %. Peligro: > ${fcUpper} %.
- Margen bruto objetivo: ${gm} % sobre ventas con tarjeta (TPV).
- Si la caja es negativa pero el económico positivo, suele significar que pagaste cuotas fiscales trimestrales acumuladas o tarjetas en bloque ese mes.
- Si el económico es negativo pero la caja positiva, suele significar que aplazaste pagos (accruals pendientes, facturas sin pagar) — el banco está ok pero el negocio está perdiendo.

OUTPUT: SOLO JSON válido, sin markdown, sin comentarios, con esta forma exacta:
{
  "quePaso": "...",
  "porquePaso": "...",
  "queBien": "...",
  "quePreocupa": "...",
  "queDecision": "...",
  "sueldoGeremi": "...",
  "queFaltaVerde": "..."
}`;
}

/* ─── Construye el user prompt con los datos del snapshot ──── */

function buildUserPrompt(
  snapshot: MonthlySnapshot,
  previousSnapshot?: MonthlySnapshot,
  founderName: string = "Geremi" // Raíz legacy por defecto; enverde pasa el fundador real
): string {
  const { monthId, cash, economic, foodCost, semaforo, possibleSalary, scenarios, warnings } = snapshot;

  const lines: string[] = [];
  lines.push(`SNAPSHOT MES ${monthId}`);
  lines.push(`Total movimientos: ${snapshot.totalMovements}`);
  lines.push("");
  lines.push("CASH del mes:");
  lines.push(`  Ventas TPV:               ${cash.ventasTpv.total.toFixed(2)} €  (${cash.ventasTpv.count} mov)`);
  lines.push(`  Ingresos otros:           ${cash.ingresosOtros.total.toFixed(2)} €`);
  lines.push(`  Coste producto pagado:    ${cash.costeProductoPagado.total.toFixed(2)} €  (${cash.costeProductoPagado.count} mov)`);
  lines.push(`  Suministros:              ${cash.suministros.total.toFixed(2)} €`);
  lines.push(`  Tecnología (IA):          ${cash.tecnologia.total.toFixed(2)} €`);
  lines.push(`  Gestoría:                 ${cash.gestoria.total.toFixed(2)} €`);
  lines.push(`  Transporte:               ${cash.transporte.total.toFixed(2)} €`);
  lines.push(`  Personal pagado:          ${cash.personalPagado.total.toFixed(2)} €`);
  lines.push(`  AEAT:                     ${cash.impuestosAEAT.total.toFixed(2)} €  (${cash.impuestosAEAT.count} mov)`);
  lines.push(`  Seguridad Social:         ${cash.seguridadSocial.total.toFixed(2)} €`);
  lines.push(`  Tarjeta pendiente:        ${cash.tarjetaPendiente.total.toFixed(2)} €  (${cash.tarjetaPendiente.count} mov)`);
  lines.push(`  Disposición socio:        ${cash.disposicionSocio.total.toFixed(2)} €`);
  lines.push(`  Traspasos internos:       ${cash.traspasosInternos.total.toFixed(2)} €  (excluidos del resultado)`);
  lines.push(`  Sin clasificar:           ${cash.sinClasificar.total.toFixed(2)} €  (${cash.sinClasificar.count} mov, ${(cash.pctSinClasificar * 100).toFixed(1)}%)`);
  lines.push(`  RESULTADO CAJA del mes:   ${cash.resultadoCaja.toFixed(2)} €`);
  lines.push("");
  lines.push("ECONÓMICO (devengo):");
  lines.push(`  Ingresos económicos:                 ${economic.ingresosTotales.toFixed(2)} €`);
  lines.push(`  Gastos operativos económicos:        ${economic.gastosOperativosTotales.toFixed(2)} €`);
  lines.push(`  AEAT + SS económicos:                ${(economic.impuestosAEAT.total + economic.seguridadSocial.total).toFixed(2)} €`);
  lines.push(`  Accruals aplicados:                  ${economic.accrualsAplicados.total.toFixed(2)} €  (${economic.accrualsAplicados.count} accruals)`);
  lines.push(`  Sueldo fundador imputado:            -${economic.sueldoFundadorImputado.toFixed(2)} €`);
  lines.push(`  RESULTADO ECONÓMICO con sueldo:      ${economic.resultadoEconomicoConSueldoFundador.toFixed(2)} €`);
  lines.push(`  RESULTADO ECONÓMICO sin sueldo:      ${economic.resultadoEconomicoAntesSueldoFundador.toFixed(2)} €`);
  lines.push("");
  lines.push("FOOD COST:");
  lines.push(`  Pagado este mes:    ${foodCost.foodCostPagadoPct.toFixed(2)}%`);
  lines.push(`  Target / alerta:    ${(foodCost.target * 100).toFixed(0)}% / ${(foodCost.alerta * 100).toFixed(0)}%`);
  lines.push(`  Estado food cost:   ${foodCost.estado}`);
  lines.push("");
  if (semaforo) {
    lines.push("SEMÁFORO actual:");
    lines.push(`  Estado: ${semaforo.estado}  (sueldo aplicado: ${semaforo.salaryUsed} €)`);
    lines.push(`  Razón:  ${semaforo.reason}`);
    lines.push("");
  }
  if (possibleSalary) {
    lines.push(`SUELDO POSIBLE ${founderName} este mes:`);
    lines.push(`  Máximo por caja:                     ${possibleSalary.sueldoMaximoCaja.toFixed(2)} €`);
    lines.push(`  Máximo por económico:                ${possibleSalary.sueldoMaximoEconomico.toFixed(2)} €`);
    lines.push(`  Máximo (el más restrictivo):         ${possibleSalary.sueldoMaximo.toFixed(2)} €`);
    lines.push(`  Recomendado prudente (70%):          ${possibleSalary.sueldoRecomendadoPrudente.toFixed(2)} €`);
    lines.push(`  Sueldo objetivo:                     ${possibleSalary.sueldoObjetivo.toFixed(2)} €`);
    if (possibleSalary.gap > 0) {
      lines.push(`  GAP a objetivo:                      ${possibleSalary.gap.toFixed(2)} € (FALTA)`);
      lines.push(`  Ventas extra/mes para cerrar gap:    ${possibleSalary.ventasExtraMesEur.toFixed(2)} €`);
      lines.push(`  Tickets extra/mes:                   ${possibleSalary.ticketsExtraMes}`);
      lines.push(`  Tickets extra/día:                   ${possibleSalary.ticketsExtraDia}`);
    } else {
      lines.push(`  GAP a objetivo:                      cubre con ${Math.abs(possibleSalary.gap).toFixed(2)} € de margen`);
    }
    lines.push("");
  }
  if (scenarios && scenarios.length > 0) {
    lines.push("ESCENARIOS de sueldo:");
    for (const sc of scenarios) {
      lines.push(`  ${sc.salary.toString().padStart(5)} € → ${sc.semaforo}, caja con sueldo: ${sc.cashWithSalary.toFixed(2)} €, económico: ${sc.economicWithSalary.toFixed(2)} €`);
    }
    lines.push("");
  }
  if (warnings && warnings.length > 0) {
    lines.push("WARNINGS activos:");
    for (const w of warnings) {
      lines.push(`  [${w.severity}] ${w.code}: ${w.message}`);
    }
    lines.push("");
  }
  if (previousSnapshot) {
    lines.push("MES ANTERIOR (referencia):");
    lines.push(`  monthId: ${previousSnapshot.monthId}`);
    lines.push(`  Ventas TPV: ${previousSnapshot.cash.ventasTpv.total.toFixed(2)} €`);
    lines.push(`  Resultado caja: ${previousSnapshot.cash.resultadoCaja.toFixed(2)} €`);
    lines.push(`  Resultado económico c/sueldo: ${previousSnapshot.economic.resultadoEconomicoConSueldoFundador.toFixed(2)} €`);
    lines.push(`  Estado: ${previousSnapshot.semaforo?.estado ?? "n/a"}`);
    lines.push("");
  }
  lines.push("INSTRUCCIÓN: devuelve el JSON con los 7 bloques para este mes. Sólo el JSON, sin nada más.");
  return lines.join("\n");
}

/* ─── Llamada a Claude ──────────────────────────────────────── */

export async function generateCFOSummary(
  snapshot: MonthlySnapshot,
  options: { previousSnapshot?: MonthlySnapshot; apiKey?: string; profile?: CFOProfile } = {}
): Promise<CFOSummary> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  // Raíz (sin profile) usa el SYSTEM_PROMPT legacy byte-idéntico; enverde pasa profile.
  const systemPrompt = options.profile ? buildSystemPrompt(options.profile) : SYSTEM_PROMPT;

  const userPrompt = buildUserPrompt(snapshot, options.previousSnapshot, options.profile?.founderName);

  // Prompt caching: el system prompt es estable y largo (>1k tokens) → vale la pena
  // cachearlo con cache_control. La parte variable (user) no se cachea.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Claude no devolvió respuesta");

  const clean = String(textBlock.text)
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  let blocks: CFOSummaryBlocks;
  try {
    blocks = JSON.parse(clean);
  } catch {
    throw new Error(`No se pudo parsear el JSON del CFO summary. Respuesta cruda: ${clean.slice(0, 300)}`);
  }

  // Validación mínima de los 7 campos
  const required: (keyof CFOSummaryBlocks)[] = [
    "quePaso",
    "porquePaso",
    "queBien",
    "quePreocupa",
    "queDecision",
    "sueldoGeremi",
    "queFaltaVerde",
  ];
  for (const k of required) {
    if (typeof blocks[k] !== "string" || blocks[k].length < 5) {
      throw new Error(`Campo ${k} inválido o vacío en respuesta de Claude`);
    }
  }

  return {
    monthId: snapshot.monthId,
    generatedAt: new Date().toISOString(),
    model: CLAUDE_MODEL,
    version: CFO_SUMMARY_VERSION,
    scenarioHashAtGeneration: snapshot.scenarioHash,
    blocks,
    inputTokens: data.usage?.input_tokens,
    cacheReadTokens: data.usage?.cache_read_input_tokens,
    cacheCreationTokens: data.usage?.cache_creation_input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}
