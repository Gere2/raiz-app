"use client";

import type { User } from "firebase/auth";
import { authedFetch } from "./authed-fetch";
import type { ActivationEventType } from "./event-types";

/**
 * Tracking interno de activación del hub Enverde — privado por diseño:
 *   - sin analytics externo (POST org-scoped a /api/org/[orgId]/events),
 *   - sin cookies nuevas (reutiliza la sesión Firebase ya activa),
 *   - sin datos sensibles (el servidor además sanea por allowlist).
 * Fire-and-forget: keepalive para sobrevivir a la navegación del CTA y
 * cualquier error se traga — el tracking jamás bloquea ni rompe la UX.
 */

export type ActivationSurface = "hub" | "demo" | "onboarding" | "summary" | "margins";

export type ActivationMetadata = { step?: number; state?: "completado" | "recomendado" | "pendiente" | "atencion" };

export function trackActivation(
  user: User,
  orgId: string,
  type: ActivationEventType,
  surface: ActivationSurface,
  metadata?: ActivationMetadata,
): void {
  try {
    void authedFetch(user, `/api/org/${orgId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, surface, metadata }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // nunca romper la UI por tracking
  }
}
