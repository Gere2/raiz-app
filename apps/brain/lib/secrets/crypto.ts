/**
 * lib/secrets/crypto.ts
 *
 * Cifrado simétrico autenticado (AES-256-GCM) para secretos en reposo
 * (p. ej. la clave Anthropic BYOK de cada café). El material de cifrado vive
 * en la env `SECRETS_ENC_KEY` (32 bytes en base64) — NUNCA en Firestore.
 *
 * Generar la clave maestra:  openssl rand -base64 32
 * Debe ser IDÉNTICA en todos los entornos (local + Vercel) o lo cifrado en uno
 * no se podrá descifrar en otro.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function masterKey(): Buffer {
  const raw = process.env.SECRETS_ENC_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENC_KEY no configurada (genera con `openssl rand -base64 32`)",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SECRETS_ENC_KEY debe ser 32 bytes en base64");
  }
  return key;
}

/** Sobre cifrado serializable a Firestore. `v` permite rotación futura. */
export type Sealed = {
  v: 1;
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  tag: string; // base64 (16 bytes, GCM auth tag)
};

export function seal(plaintext: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function open(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    masterKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
