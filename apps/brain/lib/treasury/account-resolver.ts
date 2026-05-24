/**
 * lib/treasury/account-resolver.ts
 *
 * Helpers para resolver `bank` y `accountId` a partir de los metadatos del
 * extracto bancario (bankName, accountLast4).
 *
 * Convención de IDs (decisión PR1):
 *   `${bank}_${last4}`  ej: santander_1234, bbva_5678
 *   `${bank}_main`      fallback cuando no se conoce el last4
 *
 * Esto permite escalar a múltiples cuentas/tarjetas por banco en el futuro
 * sin migrar nada.
 */

import type { TreasuryBank } from "./types";

export function normalizeBank(bankName: string | undefined | null): TreasuryBank {
  if (!bankName) return "other";
  const lower = String(bankName).toLowerCase();
  if (lower.includes("santander")) return "santander";
  if (lower.includes("bbva")) return "bbva";
  return "other";
}

export function buildAccountId(
  bank: TreasuryBank,
  last4?: string | number | null
): string {
  if (last4 == null) return `${bank}_main`;
  const cleaned = String(last4).replace(/\D/g, "").slice(-4);
  return cleaned ? `${bank}_${cleaned}` : `${bank}_main`;
}

export function buildAccountAlias(bank: TreasuryBank, last4?: string | null): string {
  const cleaned = last4 ? String(last4).replace(/\D/g, "").slice(-4) : "";
  const bankLabel =
    bank === "santander" ? "Santander" : bank === "bbva" ? "BBVA" : "Otro banco";
  return cleaned ? `${bankLabel} •••${cleaned}` : `${bankLabel} (cuenta principal)`;
}
