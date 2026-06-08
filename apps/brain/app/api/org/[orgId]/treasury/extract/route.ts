import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import { nanoid } from "nanoid";
import {
  bootstrapTreasury,
  ensureAccount,
  loadActiveRules,
} from "@/lib/treasury/store";
import {
  classificationToLegacyStatus,
  classifyMovement,
  deriveCashMonth,
} from "@/lib/treasury/classify";
import {
  buildAccountAlias,
  buildAccountId,
  normalizeBank,
} from "@/lib/treasury/account-resolver";
import type { TreasuryAccount } from "@/lib/treasury/types";
import { resolveOrgAnthropicKey } from "@/lib/secrets/org-anthropic-key";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/treasury/extract
 *
 * Recibe un extracto bancario (PDF, CSV o XLSX), extrae los movimientos
 * y los almacena en Firestore para categorización posterior.
 *
 * Body: FormData
 *   - file:           PDF, CSV o XLSX (obligatorio)
 *   - bank:           "santander" | "bbva" | "other" (opcional)
 *   - accountLast4:   string de hasta 4 dígitos (opcional)
 *
 * Si `bank` o `accountLast4` se aportan en el FormData, ganan sobre lo
 * que detecte el parser. Esto es clave para CSV de bancos que no incluyen
 * el nombre del banco en el archivo (caso típico de exports limpios).
 *
 * Returns: { ok, statementId, movements: [...] }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const overrideBank = (formData.get("bank") as string | null)?.toLowerCase() ?? null;
    const overrideLast4 = (formData.get("accountLast4") as string | null) ?? null;

    if (!file) {
      return NextResponse.json(
        { error: "Se requiere un archivo (PDF, CSV o XLSX)" },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let sourceFormat: "pdf" | "csv" | "xlsx";

    if (fileName.endsWith(".pdf")) {
      sourceFormat = "pdf";
    } else if (fileName.endsWith(".csv")) {
      sourceFormat = "csv";
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      sourceFormat = "xlsx";
    } else {
      return NextResponse.json(
        { error: "Formato no soportado. Usa PDF, CSV o XLSX." },
        { status: 400 }
      );
    }

    // Parse movements depending on format
    let extraction;

    if (sourceFormat === "pdf") {
      // PDF SIEMPRE necesita IA → resolvemos la clave del café ya (falla rápido
      // con NO_AI_KEY si el café Enverde aún no la tiene configurada).
      const aiKey = await resolveOrgAnthropicKey(orgId);
      extraction = await extractFromPdf(file, aiKey);
    } else {
      // CSV se parsea sin IA; XLSX solo usa IA como fallback → clave perezosa.
      extraction = await extractFromTabular(file, sourceFormat, () =>
        resolveOrgAnthropicKey(orgId),
      );
    }

    if (!extraction.movements || extraction.movements.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron movimientos en el archivo" },
        { status: 422 }
      );
    }

    // Calculate totals
    const totalExpenses = extraction.movements
      .filter((m: { amount: number }) => m.amount < 0)
      .reduce((sum: number, m: { amount: number }) => sum + Math.abs(m.amount), 0);
    const totalIncome = extraction.movements
      .filter((m: { amount: number }) => m.amount > 0)
      .reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);

    // ── Treasury Truth Layer: cuenta + reglas ──────────────────
    // Override del FormData gana sobre lo detectado por el parser, porque
    // los CSV limpios (BBVA/Santander) no incluyen bankName y caerían a "other".
    const resolvedBankName = overrideBank || extraction.bankName;
    const resolvedLast4 = overrideLast4 || extraction.accountLast4 || null;
    const bank = normalizeBank(resolvedBankName);
    const accountId = buildAccountId(bank, resolvedLast4);
    const accountAlias = buildAccountAlias(bank, resolvedLast4);

    let rules = await loadActiveRules(orgId);
    if (rules.length === 0) {
      // Primera vez en esta org: siembra reglas + cuentas + assumptions.
      await bootstrapTreasury(orgId);
      rules = await loadActiveRules(orgId);
    }

    // Asegura que la cuenta existe (lazy create con metadatos del extracto).
    const seedAccount: TreasuryAccount = {
      id: accountId,
      bank,
      alias: accountAlias,
      last4: resolvedLast4
        ? String(resolvedLast4).replace(/\D/g, "").slice(-4) || undefined
        : undefined,
      role:
        bank === "santander"
          ? "tpv_collection"
          : bank === "bbva"
            ? "operating"
            : "other",
      active: true,
    };
    await ensureAccount(orgId, seedAccount);

    // Store the statement
    const statementId = nanoid(12);
    const statementRef = db
      .collection("orgs").doc(orgId)
      .collection("bank_statements").doc(statementId);

    await statementRef.set({
      fileName: file.name,
      sourceFormat,
      bankName: resolvedBankName || null,
      accountLast4: resolvedLast4,
      bank,
      accountId,
      periodStart: extraction.periodStart || null,
      periodEnd: extraction.periodEnd || null,
      totalMovements: extraction.movements.length,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      processingStatus: "completed",
      uploadedBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Store each movement (clasificado al vuelo por reglas deterministas)
    const batch = db.batch();
    const movements = extraction.movements.map((m: {
      date: string;
      valueDate?: string;
      concept: string;
      amount: number;
      balance?: number;
    }) => {
      const movId = nanoid(12);
      const movRef = db
        .collection("orgs").doc(orgId)
        .collection("bank_movements").doc(movId);

      const cashMonth = deriveCashMonth(m.date);
      const cls = classifyMovement(
        { concept: m.concept, supplierName: null, amount: m.amount },
        rules
      );

      const movement = {
        id: movId,
        statementId,
        date: m.date,
        valueDate: m.valueDate || null,
        concept: m.concept,
        conceptRaw: m.concept,
        amount: m.amount,
        balance: m.balance ?? null,
        type: m.amount < 0 ? "gasto" : "ingreso",
        bank,
        accountId,
        cashMonth: cashMonth ?? null,
        category: cls.category,
        subcategory: cls.subcategory ?? null,
        flowKind: cls.flowKind,
        supplierName: cls.supplierName ?? null,
        confidence: cls.confidence,
        classifierSource: cls.classifierSource,
        classifierReason: cls.classifierReason,
        ruleVersion: cls.ruleVersion ?? null,
        status: classificationToLegacyStatus(cls),
        createdAt: FieldValue.serverTimestamp(),
      };

      batch.set(movRef, movement);
      return movement;
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      statementId,
      fileName: file.name,
      sourceFormat,
      bankName: extraction.bankName,
      totalMovements: movements.length,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      movements,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; code?: string };
    console.error("Treasury extract error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error", ...(err.code ? { code: err.code } : {}) },
      { status: err.status || 500 }
    );
  }
}

/* ─── PDF extraction via Claude AI ────────────────────────────── */

async function extractFromPdf(file: File, apiKey: string) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const documentBlock = {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
  };

  const prompt = `Analiza este extracto bancario / listado de movimientos bancarios.

Extrae TODOS los movimientos en formato JSON (sin markdown, sin backticks, solo JSON puro):

{
  "bankName": "nombre del banco si es visible",
  "accountLast4": "últimos 4 dígitos de la cuenta si es visible",
  "periodStart": "YYYY-MM-DD o null",
  "periodEnd": "YYYY-MM-DD o null",
  "movements": [
    {
      "date": "YYYY-MM-DD",
      "valueDate": "YYYY-MM-DD o null",
      "concept": "concepto / descripción del movimiento (limpio, sin códigos internos del banco)",
      "amount": -45.50,
      "balance": 1234.56
    }
  ]
}

REGLAS:
- "amount" es NEGATIVO para cargos/gastos y POSITIVO para abonos/ingresos
- Si hay fechas de operación y valor, usa "date" para operación y "valueDate" para valor
- Normaliza conceptos: quita referencias bancarias internas, números de operación, etc.
- Deja el nombre del comercio / proveedor limpio y legible
- Si el balance no está disponible para algún movimiento, usa null
- Incluye TODOS los movimientos del extracto, no omitas ninguno
- Sé conciso en los conceptos para minimizar el tamaño del JSON
- Responde SOLO con el JSON, nada más`;

  // First attempt with generous token limit
  let claudeData = await callClaude(apiKey, [
    { role: "user", content: [documentBlock, { type: "text", text: prompt }] },
  ], 16384);

  let textBlock = claudeData.content?.find(
    (b: { type: string }) => b.type === "text"
  );

  if (!textBlock?.text) {
    throw { status: 502, message: "Claude no devolvió respuesta" };
  }

  let clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Check if response was truncated (stop_reason === "max_tokens")
  if (claudeData.stop_reason === "max_tokens") {
    // Try to repair the truncated JSON by closing open structures
    const repaired = repairTruncatedJson(clean);
    if (repaired) return repaired;

    // If repair failed, retry asking Claude to continue
    claudeData = await callClaude(apiKey, [
      { role: "user", content: [documentBlock, { type: "text", text: prompt }] },
      { role: "assistant", content: clean },
      { role: "user", content: [{ type: "text", text: "Tu respuesta se cortó. Continúa EXACTAMENTE donde lo dejaste, sin repetir nada. Completa el JSON." }] },
    ], 16384);

    const contBlock = claudeData.content?.find(
      (b: { type: string }) => b.type === "text"
    );
    if (contBlock?.text) {
      clean = clean + contBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    }
  }

  try {
    return JSON.parse(clean);
  } catch {
    // Last resort: try to repair
    const repaired = repairTruncatedJson(clean);
    if (repaired) return repaired;
    throw { status: 422, message: "No se pudo parsear la respuesta de Claude" };
  }
}

/** Call Claude API with given messages and max_tokens */
async function callClaude(apiKey: string, messages: unknown[], maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Claude API error:", errText);
    throw { status: 502, message: `Error al procesar con Claude: ${res.status}` };
  }

  return res.json();
}

/**
 * Attempt to repair truncated JSON from Claude.
 * If the JSON is cut mid-array, close the open structures.
 */
function repairTruncatedJson(raw: string): { bankName?: string; movements: unknown[] } | null {
  try {
    // Already valid
    return JSON.parse(raw);
  } catch {
    // Not valid, try to repair
  }

  try {
    // Find the last complete object in the movements array
    // Look for the last "}," or "}" before truncation
    let trimmed = raw.trimEnd();

    // Remove trailing comma if present
    if (trimmed.endsWith(",")) trimmed = trimmed.slice(0, -1);

    // Count open braces/brackets to know what to close
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (const char of trimmed) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === "{") openBraces++;
      if (char === "}") openBraces--;
      if (char === "[") openBrackets++;
      if (char === "]") openBrackets--;
    }

    // If we're inside a string, try to close it
    if (inString) trimmed += '"';

    // If we're inside an incomplete object in the array, try to remove it
    // Find the last complete "}" and trim after it
    if (openBraces > 0) {
      const lastCompleteObj = trimmed.lastIndexOf("},");
      const lastObj = trimmed.lastIndexOf("}");
      const cutPoint = lastCompleteObj > lastObj - 5 ? lastCompleteObj + 1 : lastObj + 1;
      if (cutPoint > 0) {
        trimmed = trimmed.slice(0, cutPoint);
        // Recalculate
        openBraces = 0; openBrackets = 0; inString = false; escaped = false;
        for (const char of trimmed) {
          if (escaped) { escaped = false; continue; }
          if (char === "\\") { escaped = true; continue; }
          if (char === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (char === "{") openBraces++;
          if (char === "}") openBraces--;
          if (char === "[") openBrackets++;
          if (char === "]") openBrackets--;
        }
      }
    }

    // Close remaining open structures
    let suffix = "";
    for (let i = 0; i < openBrackets; i++) suffix += "]";
    for (let i = 0; i < openBraces; i++) suffix += "}";

    const result = JSON.parse(trimmed + suffix);
    if (result.movements && Array.isArray(result.movements)) {
      console.log(`[Treasury] Repaired truncated JSON: ${result.movements.length} movements recovered`);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── CSV / XLSX extraction (tabular) ─────────────────────────── */

async function extractFromTabular(
  file: File,
  format: "csv" | "xlsx",
  getAiKey: () => Promise<string>,
) {
  const text = await file.text();

  if (format === "csv") {
    return parseCSVMovements(text);
  }

  // For XLSX, we also try to parse as CSV first (many banks export as CSV with .xlsx extension)
  // A full XLSX parser would need a library like xlsx/sheetjs
  // For now, attempt CSV-style parsing; if it fails, use Claude AI
  try {
    return parseCSVMovements(text);
  } catch {
    // Fallback IA: resolvemos la clave del café SOLO aquí, cuando se usa de verdad.
    return await extractTabularWithAI(text, await getAiKey());
  }
}

function parseCSVMovements(text: string) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV vacío o sin datos");

  // Detect separator (cuenta ocurrencias en primeras 20 líneas, gana el más usado)
  const candidates = [";", "\t", ","];
  let separator = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = lines.slice(0, 20).reduce(
      (s, l) => s + (l.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
      0
    );
    if (count > bestCount) { separator = c; bestCount = count; }
  }

  // Detección automática de la línea de cabecera real (skip preámbulo).
  // Santander export: 7 líneas con titular/IBAN antes de columnas.
  // BBVA Histórico: 16 líneas + cabeceras abreviadas tipo "F. CONTABLE".
  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const cells = lines[i].split(separator).map(c => c.toLowerCase());
    const joined = cells.join(" ");
    const hasFecha = /\bfecha\b|\bdate\b|\bf\.\s*(oper|cont|val)/i.test(joined);
    const hasConcepto = /\bconcepto\b|\bdescripci|\bmovimiento\b|\bdetalle\b|\bobserv|\bbenef|\bordenante/i.test(joined);
    const hasImporte = /\bimporte\b|\bcantidad\b|\bcargo\b|\babono\b|\bmonto\b/i.test(joined);
    if (hasFecha && hasConcepto && hasImporte) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx < 0) {
    throw new Error("No detecto cabecera con fecha + concepto + importe en las primeras 50 líneas");
  }

  const headers = lines[headerLineIdx].split(separator).map(h => h.trim().toLowerCase().replace(/["']/g, ""));
  const dataStartIdx = headerLineIdx + 1;

  // dateCol: prefer F. CONTABLE / fecha operacion; evita "valor"
  let dateCol = headers.findIndex(h =>
    /\bf\.\s*(oper|cont)|fecha\s*(oper|cont)/i.test(h)
  );
  if (dateCol === -1) dateCol = headers.findIndex(h => /fecha|date/i.test(h) && !/val/i.test(h));
  if (dateCol === -1) dateCol = headers.findIndex(h => /fecha|date/i.test(h));

  const valueDateCol = headers.findIndex(h =>
    /\bf\.\s*val|fecha\s*val|value\s*date/i.test(h)
  );

  // conceptCols: TODAS las columnas de texto descriptivo. Las concatenamos
  // para que el classifier vea el merchant aunque venga partido (BBVA Histórico
  // mete CONCEPTO + BENEFICIARIO + OBSERVACIONES en columnas separadas).
  const conceptCols = headers
    .map((h, i) => /concepto|descripci|concept|detalle|movimiento|observ|benef|ordenante/i.test(h) ? i : -1)
    .filter(i => i >= 0);

  const amountCol = headers.findIndex(h =>
    /importe|cantidad|amount|monto|total/i.test(h)
  );
  const balanceCol = headers.findIndex(h =>
    /saldo|balance|disponible/i.test(h)
  );

  // Also check for separate debit/credit columns
  const debitCol = headers.findIndex(h =>
    /\bcargo\b|d[eé]bito|debit|debe/i.test(h)
  );
  const creditCol = headers.findIndex(h =>
    /\babono\b|cr[eé]dito|credit|haber/i.test(h)
  );

  if (dateCol === -1 || conceptCols.length === 0) {
    throw new Error("No se detectaron columnas de fecha y/o concepto");
  }

  const movements: Array<{
    date: string;
    valueDate?: string;
    concept: string;
    amount: number;
    balance?: number;
  }> = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line, separator);

    const rawDate = cols[dateCol]?.trim().replace(/["']/g, "");
    if (!rawDate) continue;

    const date = normalizeDate(rawDate);
    const valueDate = valueDateCol >= 0 ? normalizeDate(cols[valueDateCol]?.trim().replace(/["']/g, "") || "") : undefined;
    // El header tiene múltiples columnas de concepto/descripción
    // (`conceptCols`); las concatenamos para obtener un texto único.
    const concept = conceptCols
      .map((ci) => cols[ci]?.trim().replace(/["']/g, "") || "")
      .filter(Boolean)
      .join(" | ")
      .trim();

    let amount: number;
    if (amountCol >= 0) {
      amount = parseSpanishNumber(cols[amountCol] || "0");
    } else if (debitCol >= 0 && creditCol >= 0) {
      const debit = parseSpanishNumber(cols[debitCol] || "0");
      const credit = parseSpanishNumber(cols[creditCol] || "0");
      amount = credit > 0 ? credit : -Math.abs(debit);
    } else {
      continue; // Can't determine amount
    }

    const balance = balanceCol >= 0 ? parseSpanishNumber(cols[balanceCol] || "") : undefined;

    if (concept && !isNaN(amount) && amount !== 0) {
      movements.push({ date, valueDate: valueDate || undefined, concept, amount, balance: balance || undefined });
    }
  }

  return { movements };
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === sep && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Convert Spanish-format numbers (1.234,56) to JS numbers */
function parseSpanishNumber(str: string): number {
  const clean = str.replace(/["']/g, "").trim();
  if (!clean) return 0;
  // If has comma as decimal separator (Spanish format)
  if (clean.includes(",") && clean.includes(".")) {
    return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  }
  if (clean.includes(",") && !clean.includes(".")) {
    return parseFloat(clean.replace(",", "."));
  }
  return parseFloat(clean);
}

/** Normalize date strings to YYYY-MM-DD */
function normalizeDate(str: string): string {
  if (!str) return "";
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY or DD-MM-YYYY
  const match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  // DD/MM/YY
  const match2 = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (match2) {
    const year = parseInt(match2[3]) > 50 ? `19${match2[3]}` : `20${match2[3]}`;
    return `${year}-${match2[2].padStart(2, "0")}-${match2[1].padStart(2, "0")}`;
  }
  return str;
}

/** Fallback: use Claude AI to extract movements from raw text */
async function extractTabularWithAI(text: string, apiKey: string) {
  // Truncate to avoid token limits
  const truncated = text.slice(0, 30000);

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `Este es el contenido de un archivo de extracto bancario (CSV/Excel). Extrae todos los movimientos.

Responde SOLO con JSON puro (sin backticks):

{
  "bankName": "nombre del banco si es visible o null",
  "movements": [
    { "date": "YYYY-MM-DD", "concept": "descripción limpia", "amount": -45.50, "balance": 1234.56 }
  ]
}

REGLAS:
- amount NEGATIVO para gastos, POSITIVO para ingresos
- Normaliza conceptos: quita códigos internos, deja nombres legibles
- Incluye TODOS los movimientos
- Si balance no está disponible, usa null

DATOS:
${truncated}`,
        },
      ],
    }),
  });

  if (!claudeRes.ok) throw { status: 502, message: "Error al procesar con Claude" };

  const data = await claudeRes.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw { status: 502, message: "Claude no devolvió respuesta" };

  const clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(clean);
}
