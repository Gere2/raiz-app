import { db } from "./firebase-admin";

/**
 * Resolución de colecciones POS por organización (lado brain, Admin SDK).
 *
 * Raíz y Grano (single-tenant original) vive en las colecciones TOP-LEVEL
 * legacy: `products`, `categories`, `inventory`, `inventory_categories`. Los
 * demás cafés (alta vía enverde) viven org-scoped bajo `orgs/{orgId}/…`.
 * Espeja `LEGACY_TOPLEVEL_ORG` de los servicios del POS (product/ticket/fiscal).
 *
 * Excepción tickets: el POS escribe SIEMPRE en `orgs/{orgId}/tickets` (Raíz
 * incluida; la colección top-level `tickets` quedó congelada ~mar-2026), así que
 * los tickets NO se shimean — usar `orgTickets(orgId)`.
 */
export const LEGACY_TOPLEVEL_ORG = "raiz_y_grano";
export const isLegacyTopLevel = (orgId: string) => orgId === LEGACY_TOPLEVEL_ORG;

/** Colección POS con shim Raíz→top-level / otros→`orgs/{orgId}/{name}`. */
export function posCollection(orgId: string, name: string) {
  return isLegacyTopLevel(orgId)
    ? db.collection(name)
    : db.collection("orgs").doc(orgId).collection(name);
}

/** Tickets: siempre `orgs/{orgId}/tickets` (la top-level quedó congelada). */
export function orgTickets(orgId: string) {
  return db.collection("orgs").doc(orgId).collection("tickets");
}
