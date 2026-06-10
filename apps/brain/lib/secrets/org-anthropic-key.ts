/**
 * lib/secrets/org-anthropic-key.ts
 *
 * BYOK ("bring your own key"): cada café Enverde usa su PROPIA clave Anthropic
 * para las funciones de IA del CFO. Así el cliente paga su consumo de tokens
 * (estrategia "gratis salvo IA") y sus datos van con su propia cuenta.
 *
 * La clave se guarda cifrada (AES-256-GCM, ver ./crypto) en
 *   orgs/{orgId}/secrets/anthropic
 * y NUNCA se devuelve en claro al cliente — solo estado + last4.
 */
import { db, FieldValue } from "@/lib/firebase-admin";
import { seal, open, type Sealed } from "./crypto";

// Top-level a propósito: las colecciones sin match en firestore.rules quedan
// default-deny para el client SDK. Bajo orgs/{orgId}/* cualquier miembro tiene
// read/write desde cliente — ni el sobre cifrado ni el contador de cupo deben
// estar ahí (un miembro podría leer el blob o resetearse el cupo gratis).
const secretRef = (orgId: string) => db.collection("org_secrets").doc(orgId);

// Path original (pre-2026-06-10); se mantiene como fallback de LECTURA para no
// perder claves BYOK ya configuradas. Las escrituras van solo al path nuevo.
const legacySecretRef = (orgId: string) =>
  db.collection("orgs").doc(orgId).collection("secrets").doc("anthropic");

export type AnthropicKeyStatus = {
  configured: boolean;
  last4: string | null;
};

/** Validación superficial de formato (no garantiza que la clave funcione). */
export function looksLikeAnthropicKey(k: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());
}

/**
 * Verifica la clave contra la API de Anthropic con una llamada barata
 * (GET /v1/models, sin gasto de tokens). Solo 401/403 cuentan como inválida;
 * errores transitorios (red, 429, 5xx) NO rechazan la clave.
 */
export async function verifyAnthropicKey(key: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return true; // no verificable ahora → no bloqueamos el guardado
  }
}

export async function setOrgAnthropicKey(
  orgId: string,
  plaintextKey: string,
): Promise<{ last4: string }> {
  const key = plaintextKey.trim();
  const sealed = seal(key);
  const last4 = key.slice(-4);
  await secretRef(orgId).set({
    ...sealed,
    last4,
    provider: "anthropic",
    updatedAt: FieldValue.serverTimestamp(),
  });
  // El sobre legacy ya no debe sombrear al nuevo en los fallbacks de lectura.
  await legacySecretRef(orgId).delete();
  return { last4 };
}

export async function getOrgAnthropicKeyStatus(
  orgId: string,
): Promise<AnthropicKeyStatus> {
  let snap = await secretRef(orgId).get();
  if (!snap.exists) snap = await legacySecretRef(orgId).get();
  if (!snap.exists) return { configured: false, last4: null };
  return { configured: true, last4: (snap.data()?.last4 as string) ?? null };
}

export async function deleteOrgAnthropicKey(orgId: string): Promise<void> {
  await secretRef(orgId).delete();
  await legacySecretRef(orgId).delete();
}

/** Carga + descifra la clave propia del café (uso SOLO server-side). */
async function loadOrgKey(orgId: string): Promise<string | null> {
  let snap = await secretRef(orgId).get();
  if (!snap.exists) snap = await legacySecretRef(orgId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Partial<Sealed>;
  if (!d.ciphertext || !d.iv || !d.tag) return null;
  try {
    return open({ v: 1, ciphertext: d.ciphertext, iv: d.iv, tag: d.tag });
  } catch {
    // clave maestra rotada/ausente o sobre corrupto → tratar como "sin clave"
    return null;
  }
}

/** Error tipado para "el café no tiene clave de IA" (estrategia gratis-salvo-IA). */
export class NoAiKeyError extends Error {
  readonly status = 402;
  readonly code = "NO_AI_KEY";
  constructor(message = "Este café necesita conectar su clave de IA (Anthropic) para usar el análisis.") {
    super(message);
    this.name = "NoAiKeyError";
  }
}

// "Gratis para empezar, sin tarjeta" (promesa del funnel enverde.app): los
// cafés Enverde sin clave propia usan la clave de PLATAFORMA, pero acotado por
// un cap mensual por-org para controlar coste/abuso. Cada análisis consume ~2
// llamadas (extract + monthly-summary), así que 40 ≈ 20 análisis/mes por café
// (un café normal hace 1-4). Pasado el cap → NoAiKeyError → la UI ofrece BYOK.
// Tunable sin deploy vía env.
const ENVERDE_FREE_AI_CALLS_PER_MONTH =
  Number(process.env.ENVERDE_FREE_AI_CALLS_PER_MONTH) || 40;

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * Consume una llamada del cupo mensual gratis de plataforma para un café Enverde.
 * Transacción read+increment atómica en `enverde_usage/{orgId}_{YYYY-MM}`.
 * Top-level (no orgs/{orgId}/usage): así el client SDK no puede tocar el
 * contador (default-deny) — antes un miembro podía resetearse el cupo.
 * Nota migración: el conteo del mes en curso (2026-06) reinicia una vez al
 * cambiar de path; aceptable con el cap generoso y el piloto recién empezado.
 * Devuelve true si quedaba cupo (y lo descuenta), false si está agotado.
 */
async function consumeEnverdeFreeCall(orgId: string): Promise<boolean> {
  const ym = currentYearMonth();
  const ref = db.collection("enverde_usage").doc(`${orgId}_${ym}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.platformAiCalls as number) ?? 0;
    if (used >= ENVERDE_FREE_AI_CALLS_PER_MONTH) return false;
    tx.set(
      ref,
      { platformAiCalls: used + 1, orgId, month: ym, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return true;
  });
}

/**
 * Resuelve qué clave Anthropic usar para una org:
 *   1. clave propia del café (BYOK) si está configurada → siempre gana;
 *   2. org NO enverde (Raíz / interna) → clave de plataforma (sin cap, como antes);
 *   3. café Enverde sin clave propia → clave de PLATAFORMA bajo cap mensual
 *      (gratis-para-empezar honesto); agotado el cap → NoAiKeyError (ofrece BYOK).
 *
 * Señal canónica `source === "enverde"` (la siembra la provisión del puente).
 */
export async function resolveOrgAnthropicKey(orgId: string): Promise<string> {
  const own = await loadOrgKey(orgId);
  if (own) return own;

  const platform = process.env.ANTHROPIC_API_KEY;
  const orgSnap = await db.collection("orgs").doc(orgId).get();
  const isEnverdeCustomer = orgSnap.data()?.source === "enverde";

  if (!isEnverdeCustomer) {
    if (platform) return platform;
    throw new NoAiKeyError();
  }

  // Café Enverde: cubrimos la IA con la clave de plataforma mientras quede cupo.
  if (!platform) throw new NoAiKeyError();
  const withinQuota = await consumeEnverdeFreeCall(orgId);
  if (!withinQuota) throw new NoAiKeyError();
  return platform;
}
