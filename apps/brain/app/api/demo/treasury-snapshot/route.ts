import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  aggregateMonth,
  type AggregatorMovement,
} from "@/lib/treasury/monthly-aggregator";
import { classifyMovement, deriveCashMonth } from "@/lib/treasury/classify";
import { SEED_RULES } from "@/lib/treasury/seed-rules";
import { DEFAULT_ASSUMPTIONS } from "@/lib/treasury/seed-accounts";
import type { TreasuryRule } from "@/lib/treasury/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/demo/treasury-snapshot — PÚBLICO, sin auth, sin Firestore.
 *
 * Corre el motor REAL del Treasury Truth Layer (`aggregateMonth`, función pura)
 * sobre un extracto pegado/subido, para el DEMO público de enverde.app.
 * Determinista → instantáneo (sin Claude). NO persiste nada, NO toca ninguna org.
 *
 * Body JSON: { text: string, monthId?: "YYYY-MM" }
 * Devuelve un resumen CFO plano (sueldo posible, food cost, semáforo, caja, avisos).
 *
 * ADITIVO a propósito: este archivo NO modifica nada del brain de Raíz; solo
 * importa funciones puras y constantes. Lo llama el server de enverde.app
 * (no el navegador) → sin CORS. Si `DEMO_SNAPSHOT_SECRET` está en env, se exige
 * en el header `x-demo-secret`; si no está, queda abierto (es solo cálculo).
 */

// Reglas genéricas de cafetería que las SEED_RULES (específicas de Raíz) no
// cubren: utilities comunes, gestoría/alquiler genéricos, traspasos internos.
// Prioridad por debajo de las TPV/AEAT/SS de seed pero suficiente para un demo.
const DEMO_GENERIC_RULES: TreasuryRule[] = [
  {
    id: "demo_transfer",
    name: "Traspaso interno entre cuentas",
    priority: 160,
    version: 1,
    active: true,
    amountSign: "any",
    matchers: [{ field: "concept", keywordsAny: ["traspaso", "transferencia entre cuentas", "entre cuentas propias", "traspaso interno"] }],
    action: { category: "otros", flowKind: "internal_transfer", confidence: 0.8 },
    source: "seed",
  },
  {
    id: "demo_utilities",
    name: "Suministros genéricos (luz / agua / gas)",
    priority: 148,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [{ field: "concept_or_supplier", keywordsAny: ["iberdrola", "endesa", "naturgy", "holaluz", "totalenergies", "gas natural", "electricidad", "factura luz", "canal isabel", "aqualia", "emasesa", "hidraqua"] }],
    action: { category: "suministros", subcategory: "luz_gas", flowKind: "expense_operating", confidence: 0.8 },
    source: "seed",
  },
  {
    id: "demo_gestoria_generic",
    name: "Gestoría / asesoría genérica",
    priority: 148,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [{ field: "concept_or_supplier", keywordsAny: ["gestoria", "gestoría", "asesoria", "asesoría"] }],
    action: { category: "servicios", subcategory: "gestoria", flowKind: "expense_operating", confidence: 0.8 },
    source: "seed",
  },
  {
    id: "demo_rent",
    name: "Alquiler / arrendamiento local",
    priority: 148,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [{ field: "concept_or_supplier", keywordsAny: ["alquiler", "arrendamiento", "renta local"] }],
    action: { category: "alquiler", flowKind: "expense_operating", confidence: 0.8 },
    source: "seed",
  },
  {
    id: "demo_food_generic",
    name: "Proveedores de alimentación genéricos",
    priority: 135,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [{ field: "concept_or_supplier", keywordsAny: ["fruteria", "frutería", "frutas", "verduras", "leche", "panaderia", "panadería", "obrador", "distribuidora", "mercadona", "makro", "carrefour", "alcampo", "bonarea"] }],
    action: { category: "materia_prima", subcategory: "alimentacion", flowKind: "expense_operating", confidence: 0.7 },
    source: "seed",
  },
];

const ALL_RULES: TreasuryRule[] = [...SEED_RULES, ...DEMO_GENERIC_RULES];

const MAX_TEXT_CHARS = 16000;

/* ─── Parser: extracto en texto libre (una línea por movimiento) o CSV ─── */

function parseSpanishNumber(str: string): number {
  const clean = str.replace(/[€"'\s]/g, "").trim();
  if (!clean) return NaN;
  if (clean.includes(",") && clean.includes(".")) return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  if (clean.includes(",")) return parseFloat(clean.replace(",", "."));
  return parseFloat(clean);
}

function normalizeDate(str: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  let m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (m) {
    const yr = parseInt(m[3], 10) > 50 ? `19${m[3]}` : `20${m[3]}`;
    return `${yr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

type RawMovement = { date: string; concept: string; amount: number };

// Importe al final de línea: signo opcional, formato español (1.234,56) o entero.
const AMOUNT_RE = /([+-]?)\s*(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2}|\d{1,3}(?:\.\d{3})+|\d+)\s*€?\s*$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})|(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/;

function parseExtract(text: string): RawMovement[] {
  const out: RawMovement[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const raw of lines) {
    // Soporta separadores CSV reemplazándolos por espacio para el escaneo por línea.
    const line = raw.replace(/[;\t]+/g, " ").trim();
    if (!line || line.length < 6) continue;

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    const date = normalizeDate(dateMatch[0]);
    if (!date) continue;

    const amtMatch = line.match(AMOUNT_RE);
    if (!amtMatch) continue;
    let amount = parseSpanishNumber(amtMatch[2]);
    if (!isFinite(amount) || amount === 0) continue;
    if (amtMatch[1] === "-") amount = -Math.abs(amount);
    else if (amtMatch[1] === "+") amount = Math.abs(amount);

    let concept = line.replace(dateMatch[0], " ").replace(amtMatch[0], " ");
    concept = concept.replace(/[,|]+/g, " ").replace(/\s+/g, " ").trim();
    if (!concept) continue;

    out.push({ date, concept, amount });
    if (out.length >= 600) break; // safety
  }
  return out;
}

function pickMonthId(movs: { cashMonth?: string | null }[], override?: string): string {
  if (override && /^\d{4}-(0[1-9]|1[0-2])$/.test(override)) return override;
  const counts = new Map<string, number>();
  for (const m of movs) if (m.cashMonth) counts.set(m.cashMonth, (counts.get(m.cashMonth) || 0) + 1);
  let best = "";
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best || new Date().toISOString().slice(0, 7);
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.DEMO_SNAPSHOT_SECRET;
    if (secret && req.headers.get("x-demo-secret") !== secret) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const text = String(body?.text || "").slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) return NextResponse.json({ error: "Falta el extracto (campo 'text')" }, { status: 400 });

    const raw = parseExtract(text);
    if (raw.length === 0) {
      return NextResponse.json(
        { error: "No reconocí ningún movimiento. Formato esperado por línea: fecha · concepto · importe (ej. 2026-04-02 LIQUIDACION TPV +298,40)." },
        { status: 422 },
      );
    }

    const movements: AggregatorMovement[] = raw.map((m, i) => {
      const cls = classifyMovement({ concept: m.concept, supplierName: null, amount: m.amount }, ALL_RULES);
      return {
        id: `demo_${i}`,
        date: m.date,
        amount: m.amount,
        concept: m.concept,
        category: cls.category,
        subcategory: cls.subcategory ?? null,
        flowKind: cls.flowKind,
        classifierSource: cls.classifierSource,
        cashMonth: deriveCashMonth(m.date),
      };
    });

    const monthId = pickMonthId(movements, body?.monthId);
    const snap = aggregateMonth({ monthId, movements, assumptions: DEFAULT_ASSUMPTIONS });
    const ps = snap.possibleSalary;

    return NextResponse.json({
      ok: true,
      engine: "treasury-truth-layer",
      periodo: monthId,
      movimientos: snap.totalMovements,
      ventas_tpv: snap.cash.ventasTpv.total,
      ingresos_totales: snap.cash.ingresosTotales,
      resultado_caja: snap.cash.resultadoCaja,
      food_cost_pct: snap.foodCost.foodCostPagadoPct,
      food_cost_estado: snap.foodCost.estado,
      food_cost_target_pct: Math.round(snap.foodCost.target * 100),
      semaforo: snap.semaforo?.estado ?? null,
      semaforo_motivo: snap.semaforo?.reason ?? null,
      sueldo_maximo: ps?.sueldoMaximo ?? null,
      sueldo_recomendado: ps?.sueldoRecomendadoPrudente ?? null,
      sueldo_objetivo: ps?.sueldoObjetivo ?? null,
      gap_sueldo: ps?.gap ?? null,
      ventas_extra_para_objetivo: ps?.ventasExtraMesEur ?? null,
      sin_clasificar_pct: Math.round(snap.cash.pctSinClasificar * 1000) / 10,
      avisos: snap.warnings.map((w) => w.message),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
