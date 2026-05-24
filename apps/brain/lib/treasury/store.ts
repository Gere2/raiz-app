/**
 * lib/treasury/store.ts
 *
 * Thin Firestore wrapper para Treasury Truth Layer.
 *
 * Centraliza paths y operaciones de seed para que los endpoints no toquen
 * los strings de colección directamente. Todas las operaciones de seed son
 * idempotentes y nunca pisan reglas con `source = "manual" | "learned"`.
 */

import { db, FieldValue } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import type {
  TreasuryAccount,
  TreasuryAssumptions,
  TreasuryRule,
} from "./types";
import type { AggregatorAccrual } from "./monthly-aggregator";
import { SEED_RULES } from "./seed-rules";
import { SEED_ACCOUNTS, DEFAULT_ASSUMPTIONS } from "./seed-accounts";

const adminDb = db as Firestore;

const rulesCol = (orgId: string) =>
  adminDb.collection("orgs").doc(orgId).collection("treasury_rules");
const accountsCol = (orgId: string) =>
  adminDb.collection("orgs").doc(orgId).collection("treasury_accounts");
const assumptionsCol = (orgId: string) =>
  adminDb.collection("orgs").doc(orgId).collection("treasury_assumptions");
const accrualsCol = (orgId: string) =>
  adminDb.collection("orgs").doc(orgId).collection("treasury_accruals");

/* ─── Rules ─────────────────────────────────────────────────── */

export async function loadActiveRules(orgId: string): Promise<TreasuryRule[]> {
  const snap = await rulesCol(orgId).where("active", "==", true).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TreasuryRule, "id">) }));
}

export async function loadAllRules(orgId: string): Promise<TreasuryRule[]> {
  const snap = await rulesCol(orgId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TreasuryRule, "id">) }));
}

export type SeedRulesResult = {
  created: string[];
  updated: string[];
  skipped: string[];
};

export async function seedRules(orgId: string): Promise<SeedRulesResult> {
  const result: SeedRulesResult = { created: [], updated: [], skipped: [] };
  for (const rule of SEED_RULES) {
    const ref = rulesCol(orgId).doc(rule.id);
    const existing = await ref.get();
    if (!existing.exists) {
      await ref.set({
        ...rule,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      result.created.push(rule.id);
      continue;
    }
    const data = existing.data() as TreasuryRule;
    if (data.source !== "seed") {
      result.skipped.push(rule.id);
      continue;
    }
    if ((data.version ?? 0) >= rule.version) {
      result.skipped.push(rule.id);
      continue;
    }
    await ref.update({
      ...rule,
      updatedAt: FieldValue.serverTimestamp(),
    });
    result.updated.push(rule.id);
  }
  return result;
}

/* ─── Accounts ──────────────────────────────────────────────── */

export async function loadAccounts(orgId: string): Promise<TreasuryAccount[]> {
  const snap = await accountsCol(orgId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TreasuryAccount, "id">) }));
}

export async function ensureAccount(
  orgId: string,
  account: TreasuryAccount
): Promise<"created" | "exists"> {
  const ref = accountsCol(orgId).doc(account.id);
  const existing = await ref.get();
  if (existing.exists) return "exists";
  await ref.set({
    ...account,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return "created";
}

export async function seedAccounts(orgId: string): Promise<{ created: string[]; existed: string[] }> {
  const created: string[] = [];
  const existed: string[] = [];
  for (const a of SEED_ACCOUNTS) {
    const r = await ensureAccount(orgId, a);
    if (r === "created") created.push(a.id);
    else existed.push(a.id);
  }
  return { created, existed };
}

/* ─── Assumptions ───────────────────────────────────────────── */

export async function ensureDefaultAssumptions(orgId: string): Promise<"created" | "exists"> {
  const ref = assumptionsCol(orgId).doc("_default");
  const existing = await ref.get();
  if (existing.exists) return "exists";
  await ref.set({
    ...DEFAULT_ASSUMPTIONS,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return "created";
}

export async function loadAssumptions(
  orgId: string,
  monthId?: string
): Promise<{ assumptions: TreasuryAssumptions; sources: string[] }> {
  const sources: string[] = [];
  const defaultDoc = await assumptionsCol(orgId).doc("_default").get();
  let merged: TreasuryAssumptions = { ...DEFAULT_ASSUMPTIONS };
  if (defaultDoc.exists) {
    merged = { ...merged, ...(defaultDoc.data() as TreasuryAssumptions) };
    sources.push("_default");
  }
  if (monthId) {
    const monthDoc = await assumptionsCol(orgId).doc(monthId).get();
    if (monthDoc.exists) {
      merged = { ...merged, ...(monthDoc.data() as Partial<TreasuryAssumptions>) };
      sources.push(monthId);
    }
  }
  return { assumptions: merged, sources };
}

/* ─── Assumption overrides por mes (PR4) ────────────────────── */

export async function upsertAssumption(
  orgId: string,
  monthId: string, // "YYYY-MM" o "_default"
  overrides: Partial<TreasuryAssumptions>
): Promise<{ created: boolean; merged: TreasuryAssumptions }> {
  const ref = assumptionsCol(orgId).doc(monthId);
  const existing = await ref.get();
  const created = !existing.exists;
  const data: Record<string, unknown> = {
    ...overrides,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (created) data.createdAt = FieldValue.serverTimestamp();
  await ref.set(data, { merge: true });
  const final = await ref.get();
  return {
    created,
    merged: final.data() as TreasuryAssumptions,
  };
}

/* ─── Accruals (PR4) ────────────────────────────────────────── */

export async function loadAccruals(
  orgId: string,
  filter: { economicMonth?: string; status?: string } = {}
): Promise<AggregatorAccrual[]> {
  let query: FirebaseFirestore.Query = accrualsCol(orgId);
  if (filter.economicMonth) {
    query = query.where("economicMonth", "==", filter.economicMonth);
  }
  if (filter.status) {
    query = query.where("status", "==", filter.status);
  }
  const snap = await query.get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AggregatorAccrual, "id">),
  }));
}

export async function createAccrual(
  orgId: string,
  data: Omit<AggregatorAccrual, "id"> & { createdBy?: string }
): Promise<string> {
  const ref = accrualsCol(orgId).doc();
  await ref.set({
    ...data,
    status: data.status ?? "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateAccrual(
  orgId: string,
  accrualId: string,
  patch: Partial<AggregatorAccrual>
): Promise<void> {
  const ref = accrualsCol(orgId).doc(accrualId);
  await ref.update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deleteAccrual(orgId: string, accrualId: string): Promise<void> {
  await accrualsCol(orgId).doc(accrualId).delete();
}

/* ─── Bootstrap (seed everything) ────────────────────────────── */

export async function bootstrapTreasury(orgId: string) {
  const rules = await seedRules(orgId);
  const accounts = await seedAccounts(orgId);
  const assumptions = await ensureDefaultAssumptions(orgId);
  return { rules, accounts, assumptions };
}
