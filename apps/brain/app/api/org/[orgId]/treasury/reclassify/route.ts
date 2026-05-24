import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";
import {
  bootstrapTreasury,
  ensureAccount,
  loadAccounts,
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
import type { TreasuryAccount, TreasuryRule } from "@/lib/treasury/types";

type Params = { params: Promise<{ orgId: string }> };

type Scope = "all" | "pending" | "needs_review" | "missing_classifier";

type LegacyMovement = {
  id: string;
  statementId?: string;
  date?: string;
  concept?: string;
  conceptRaw?: string;
  amount?: number;
  type?: string;
  status?: string;
  category?: string;
  subcategory?: string;
  flowKind?: string;
  supplierName?: string;
  confidence?: number;
  classifierSource?: string;
  classifierReason?: string;
  ruleVersion?: number;
  bank?: string;
  accountId?: string;
  cashMonth?: string;
};

const MAX_LIMIT = 2000;
const BATCH_CHUNK = 400;

/**
 * POST /api/org/[orgId]/treasury/reclassify
 *
 * Aplica el clasificador determinista a movimientos existentes. Idempotente.
 *
 * Body:
 *   {
 *     scope?: "all" | "pending" | "needs_review" | "missing_classifier",
 *     movementIds?: string[],
 *     dryRun?: boolean,                  // no escribe, solo reporta
 *     forceOverwriteManual?: boolean,    // pisa clasificaciones manuales (off por defecto)
 *     bootstrap?: boolean,               // siembra rules/accounts/assumptions si faltan
 *     limit?: number                     // máx. movimientos a procesar (default 1000, máx 2000)
 *   }
 *
 * Comportamiento:
 *   - Carga reglas activas; si bootstrap=true y no hay, las crea.
 *   - Para cada movimiento:
 *       a) Migra campos faltantes (bank, accountId, cashMonth, conceptRaw).
 *       b) Asegura que el accountId existe en treasury_accounts.
 *       c) Reclasifica si tiene sentido (ver shouldReclassify).
 *   - Devuelve summary con conteo por regla y 5 ejemplos antes/después.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    const body = await req.json().catch(() => ({}));

    const scope: Scope = body.scope ?? "all";
    const dryRun: boolean = body.dryRun === true;
    const forceOverwriteManual: boolean = body.forceOverwriteManual === true;
    const bootstrap: boolean = body.bootstrap !== false; // por defecto siembra
    const limit = Math.min(Math.max(body.limit ?? 1000, 1), MAX_LIMIT);
    const movementIds: string[] | undefined = Array.isArray(body.movementIds)
      ? body.movementIds.slice(0, limit)
      : undefined;

    /* ─── Bootstrap (idempotente) ──────────────────────────── */
    let bootstrapResult: Awaited<ReturnType<typeof bootstrapTreasury>> | null = null;
    let rules: TreasuryRule[] = await loadActiveRules(orgId);
    if (rules.length === 0 && bootstrap) {
      bootstrapResult = await bootstrapTreasury(orgId);
      rules = await loadActiveRules(orgId);
    }
    if (rules.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay reglas activas. Llama con { bootstrap: true } o POST /treasury/rules { action: 'seed' }.",
        },
        { status: 422 }
      );
    }

    /* ─── Fetch movements ──────────────────────────────────── */
    const movements = await fetchMovements(orgId, scope, movementIds, limit);
    if (movements.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No hay movimientos en el scope solicitado.",
        bootstrap: bootstrapResult,
      });
    }

    /* ─── Statements lookup (para inferir bank de movimientos legacy) ─ */
    const stmtIds = Array.from(
      new Set(movements.map((m) => m.statementId).filter(Boolean) as string[])
    );
    const statementMap = await loadStatementsBatched(orgId, stmtIds);
    const accountsMap = new Map<string, TreasuryAccount>(
      (await loadAccounts(orgId)).map((a) => [a.id, a])
    );

    /* ─── Reclassify ───────────────────────────────────────── */
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const byRule: Record<string, number> = {};
    const examples: Array<{
      id: string;
      concept: string;
      amount: number;
      before: { category?: string; flowKind?: string; classifierSource?: string };
      after: {
        category: string;
        subcategory?: string;
        flowKind: string;
        classifierSource: string;
        classifierReason: string;
        confidence: number;
      };
    }> = [];
    let skippedManual = 0;
    let skippedDetector = 0;
    let skippedNoChange = 0;

    for (const m of movements) {
      // 1) Migración de campos del movimiento (sólo si faltan)
      const migrate = computeMigrationFields(m, statementMap);

      // 2) Decidir si reclasificar
      const decision = decideClassification(m, rules, forceOverwriteManual);

      if (decision === "skip-manual" || decision === "skip-detector") {
        if (decision === "skip-manual") skippedManual++;
        else skippedDetector++;
        // Igual aplicamos campos de migración si los hay
        if (Object.keys(migrate).length > 0) {
          updates.push({ id: m.id, data: { ...migrate, updatedAt: FieldValue.serverTimestamp() } });
        }
        continue;
      }

      const cls = classifyMovement(
        {
          concept: m.concept ?? null,
          supplierName: m.supplierName ?? null,
          amount: m.amount ?? 0,
        },
        rules
      );

      // 3) ¿Cambió algo?
      const changed =
        m.classifierSource !== cls.classifierSource ||
        m.category !== cls.category ||
        m.flowKind !== cls.flowKind ||
        m.subcategory !== cls.subcategory ||
        (m.confidence ?? -1) !== cls.confidence ||
        m.ruleVersion !== cls.ruleVersion;

      if (!changed && Object.keys(migrate).length === 0) {
        skippedNoChange++;
        continue;
      }

      const ruleKey = cls.classifierSource;
      byRule[ruleKey] = (byRule[ruleKey] ?? 0) + 1;

      const data: Record<string, unknown> = {
        ...migrate,
        category: cls.category,
        subcategory: cls.subcategory ?? null,
        flowKind: cls.flowKind,
        confidence: cls.confidence,
        classifierSource: cls.classifierSource,
        classifierReason: cls.classifierReason,
        ruleVersion: cls.ruleVersion ?? null,
        status: classificationToLegacyStatus(cls),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Sólo seteamos supplierName si la regla aporta uno; no pisamos
      // un supplierName manual ya guardado.
      if (cls.supplierName && !m.supplierName) {
        data.supplierName = cls.supplierName;
      }

      updates.push({ id: m.id, data });

      if (examples.length < 5) {
        examples.push({
          id: m.id,
          concept: m.concept ?? "",
          amount: m.amount ?? 0,
          before: {
            category: m.category,
            flowKind: m.flowKind,
            classifierSource: m.classifierSource,
          },
          after: {
            category: cls.category,
            subcategory: cls.subcategory,
            flowKind: cls.flowKind,
            classifierSource: cls.classifierSource,
            classifierReason: cls.classifierReason,
            confidence: cls.confidence,
          },
        });
      }
    }

    /* ─── Crear cuentas faltantes detectadas en migración ──── */
    const newAccountIds = new Set<string>();
    for (const u of updates) {
      const accId = u.data.accountId as string | undefined;
      if (accId && !accountsMap.has(accId)) newAccountIds.add(accId);
    }
    const accountsCreated: string[] = [];
    if (!dryRun) {
      for (const accId of newAccountIds) {
        const [bank, last4] = parseAccountId(accId);
        const acc: TreasuryAccount = {
          id: accId,
          bank,
          alias: buildAccountAlias(bank, last4),
          last4: last4 ?? undefined,
          role:
            bank === "santander"
              ? "tpv_collection"
              : bank === "bbva"
                ? "operating"
                : "other",
          active: true,
        };
        const r = await ensureAccount(orgId, acc);
        if (r === "created") accountsCreated.push(accId);
        accountsMap.set(accId, acc);
      }
    }

    /* ─── Commit batched ──────────────────────────────────── */
    let written = 0;
    if (!dryRun && updates.length > 0) {
      for (let i = 0; i < updates.length; i += BATCH_CHUNK) {
        const batch = db.batch();
        for (const { id, data } of updates.slice(i, i + BATCH_CHUNK)) {
          const ref = db
            .collection("orgs")
            .doc(orgId)
            .collection("bank_movements")
            .doc(id);
          batch.update(ref, data);
        }
        await batch.commit();
        written += Math.min(BATCH_CHUNK, updates.length - i);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      processed: movements.length,
      updated: written,
      pendingUpdates: dryRun ? updates.length : 0,
      skippedManual,
      skippedDetector,
      skippedNoChange,
      accountsCreated,
      byRule,
      examples,
      bootstrap: bootstrapResult,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury reclassify error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/* ─── Helpers ───────────────────────────────────────────────── */

async function fetchMovements(
  orgId: string,
  scope: Scope,
  movementIds: string[] | undefined,
  limit: number
): Promise<LegacyMovement[]> {
  const col = db.collection("orgs").doc(orgId).collection("bank_movements");

  if (movementIds && movementIds.length > 0) {
    const refs = movementIds.map((id) => col.doc(id));
    const snaps = await db.getAll(...refs);
    return snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as Omit<LegacyMovement, "id">) }));
  }

  let query = col.orderBy("date", "desc").limit(limit) as FirebaseFirestore.Query;

  if (scope === "pending") {
    query = col.where("status", "==", "pending").limit(limit);
  } else if (scope === "needs_review") {
    query = col.where("flowKind", "==", "needs_review").limit(limit);
  } else if (scope === "missing_classifier") {
    // No podemos hacer un where(... !=) eficiente; cargamos por status pending
    // + filtramos en memoria por ausencia de classifierSource.
    query = col.limit(limit);
  }

  const snap = await query.get();
  let docs = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LegacyMovement, "id">),
  }));

  if (scope === "missing_classifier") {
    docs = docs.filter((d) => !d.classifierSource);
  }
  return docs;
}

async function loadStatementsBatched(orgId: string, statementIds: string[]) {
  const map = new Map<string, { bankName?: string; accountLast4?: string }>();
  if (statementIds.length === 0) return map;
  const refs = statementIds.map((id) =>
    db.collection("orgs").doc(orgId).collection("bank_statements").doc(id)
  );
  // db.getAll soporta hasta 500 docs por llamada
  for (let i = 0; i < refs.length; i += 500) {
    const snaps = await db.getAll(...refs.slice(i, i + 500));
    for (const s of snaps) {
      if (s.exists) {
        map.set(s.id, s.data() as { bankName?: string; accountLast4?: string });
      }
    }
  }
  return map;
}

function computeMigrationFields(
  m: LegacyMovement,
  statementMap: Map<string, { bankName?: string; accountLast4?: string }>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const stmt = m.statementId ? statementMap.get(m.statementId) : undefined;

  if (!m.bank) {
    const bank = normalizeBank(stmt?.bankName);
    out.bank = bank;
  }
  if (!m.accountId) {
    const bank = (out.bank as string | undefined) ?? normalizeBank(stmt?.bankName);
    out.accountId = buildAccountId(bank as ReturnType<typeof normalizeBank>, stmt?.accountLast4);
  }
  if (!m.cashMonth) {
    const cm = deriveCashMonth(m.date);
    if (cm) out.cashMonth = cm;
  }
  if (!m.conceptRaw && m.concept) {
    out.conceptRaw = m.concept;
  }
  return out;
}

/**
 * Decide si reclasificar el movimiento. Reglas:
 *   - manual / learned (correcciones humanas) → no se pisa salvo forceOverwriteManual.
 *   - detector:* (ej: internal_transfer_detector de PR2) → no se pisa salvo
 *     forceOverwriteManual; el clasificador por concepto no tiene contexto
 *     suficiente para anular la decisión cruzada del detector.
 *   - todo lo demás (rule, ai, default, sin source) → se reclasifica.
 */
function decideClassification(
  m: LegacyMovement,
  _rules: TreasuryRule[],
  forceOverwriteManual: boolean
): "reclassify" | "skip-manual" | "skip-detector" {
  if (forceOverwriteManual) return "reclassify";
  if (m.classifierSource === "manual" || m.classifierSource === "learned") {
    return "skip-manual";
  }
  if (m.classifierSource && m.classifierSource.startsWith("detector:")) {
    return "skip-detector";
  }
  return "reclassify";
}

function parseAccountId(id: string): [ReturnType<typeof normalizeBank>, string | undefined] {
  const parts = id.split("_");
  const bank = normalizeBank(parts[0]);
  const last4 = parts[1] && parts[1] !== "main" ? parts[1] : undefined;
  return [bank, last4];
}
