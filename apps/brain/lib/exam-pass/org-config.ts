/**
 * Bono Supervivencia Exámenes — resolución de catálogo/reglas POR CAFÉ.
 *
 * El catálogo canónico vive (hardcodeado) en `config.ts` y es el de Raíz y Grano.
 * Este módulo lo hace per-café SIN tocar el motor de pago/canje:
 *
 *   - Raíz y Grano → config canónica EXACTA (early-return, sin lectura) → su
 *     flujo de compra/canje queda byte-idéntico.
 *   - Otros cafés → override opcional en `orgs/{orgId}/settings/examPass`
 *     mergeado sobre la canónica (un café Pro define solo lo que cambia).
 *
 * Fuente única que reemplaza los mirrors hardcodeados (apps/app + modal POS).
 *
 * IMPORTANTE — activación del CÁLCULO per-café: `calc.computeOrder` valida hoy
 * contra el catálogo canónico de módulo. Mientras los bonos estén gateados a
 * Raíz (no hay café Pro real), eso es correcto. Cuando se onboarde un café Pro
 * con catálogo propio, el paso final es que el path de canje
 * (`/api/org/[orgId]/exam-pass/redeem` → engine → computeOrder) resuelva su
 * catálogo vía `getExamPassConfig(orgId)`. No se hace ahora para no tocar el
 * motor de cobro Stripe en vivo de Raíz por una feature sin usuarios.
 */
import { isLegacyTopLevel } from "../pos-scope"
import { db } from "../firebase-admin"
import {
  EXAM_PASS_PRICING,
  EXAM_PASS_RULES,
  INCLUDED_PRODUCTS,
  PREMIUM_PRODUCTS,
  MILK_OPTIONS,
  EXTRAS_OPTIONS,
  PASTRY_OPTIONS,
  type IncludedProductDef,
  type PremiumProductDef,
  type MilkDef,
  type ExtraDef,
  type PastryDef,
} from "./config"

export interface ExamPassConfig {
  pricing: { EARLY_BIRD_LIMIT: number; EARLY_BIRD_PRICE: number; STANDARD_PRICE: number }
  rules: { CREDITS_TOTAL: number; VALIDITY_DAYS: number; TIMEZONE: string }
  included: readonly IncludedProductDef[]
  premium: readonly PremiumProductDef[]
  milks: readonly MilkDef[]
  extras: readonly ExtraDef[]
  pastries: readonly PastryDef[]
}

/** Config canónica (Raíz). Default para cualquier café sin override. */
export const CANONICAL_EXAM_PASS_CONFIG: ExamPassConfig = {
  pricing: { ...EXAM_PASS_PRICING },
  rules: { ...EXAM_PASS_RULES },
  included: INCLUDED_PRODUCTS,
  premium: PREMIUM_PRODUCTS,
  milks: MILK_OPTIONS,
  extras: EXTRAS_OPTIONS,
  pastries: PASTRY_OPTIONS,
}

/** Resuelve la config del Bono para un café (Raíz canónica; otros con override). */
export async function getExamPassConfig(orgId: string): Promise<ExamPassConfig> {
  // Raíz: byte-idéntica, sin lectura → cero cambio de comportamiento.
  if (isLegacyTopLevel(orgId)) return CANONICAL_EXAM_PASS_CONFIG

  try {
    const snap = await db
      .collection("orgs")
      .doc(orgId)
      .collection("settings")
      .doc("examPass")
      .get()
    if (!snap.exists) return CANONICAL_EXAM_PASS_CONFIG

    const o = (snap.data() || {}) as Partial<ExamPassConfig>
    return {
      pricing: { ...CANONICAL_EXAM_PASS_CONFIG.pricing, ...(o.pricing || {}) },
      rules: { ...CANONICAL_EXAM_PASS_CONFIG.rules, ...(o.rules || {}) },
      included: Array.isArray(o.included) ? o.included : CANONICAL_EXAM_PASS_CONFIG.included,
      premium: Array.isArray(o.premium) ? o.premium : CANONICAL_EXAM_PASS_CONFIG.premium,
      milks: Array.isArray(o.milks) ? o.milks : CANONICAL_EXAM_PASS_CONFIG.milks,
      extras: Array.isArray(o.extras) ? o.extras : CANONICAL_EXAM_PASS_CONFIG.extras,
      pastries: Array.isArray(o.pastries) ? o.pastries : CANONICAL_EXAM_PASS_CONFIG.pastries,
    }
  } catch {
    return CANONICAL_EXAM_PASS_CONFIG
  }
}
