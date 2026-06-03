import { collection, doc } from "firebase/firestore"
import { db } from "./firebase"

/**
 * Resolución de colecciones por organización en el POS (client SDK).
 *
 * Raíz y Grano (single-tenant original) vive en las colecciones TOP-LEVEL
 * legacy (`products`, `categories`, `inventory`, `product_daily_stats`, `config`…);
 * los demás cafés (alta vía enverde) viven org-scoped bajo `orgs/{orgId}/…`.
 *
 * Las reglas Firestore lo respaldan sin cambios: Raíz (token staff) accede a las
 * colecciones root vía `isStaff()`; los cafés (miembros de la org, sin staff)
 * acceden a `orgs/{orgId}/**` vía el catch-all `isOrgMember(orgId)`.
 *
 * Excepción: los TICKETS viven SIEMPRE en `orgs/{orgId}/tickets` (Raíz incluida;
 * la colección top-level `tickets` quedó congelada) → no usan este shim.
 *
 * Fuente única del shim — antes duplicado en product-service / ticket-service /
 * fiscal-service.
 */
export const LEGACY_TOPLEVEL_ORG = "raiz_y_grano"
export const isLegacyTopLevel = (orgId: string) => orgId === LEGACY_TOPLEVEL_ORG

/** Colección con shim Raíz→top-level / otros→`orgs/{orgId}/{name}`. */
export const orgCollection = (orgId: string, name: string) =>
  isLegacyTopLevel(orgId) ? collection(db, name) : collection(db, "orgs", orgId, name)

/** Doc con shim Raíz→top-level / otros→`orgs/{orgId}/{name}/{id}`. */
export const orgDoc = (orgId: string, name: string, id: string) =>
  isLegacyTopLevel(orgId) ? doc(db, name, id) : doc(db, "orgs", orgId, name, id)
