/**
 * lib/require-staff.ts — Auth helper para acciones que solo puede hacer staff.
 *
 * Acepta como staff a quien cumpla CUALQUIERA:
 *  1. Custom claim Firebase `staff: true`.
 *  2. Custom claim `role` ∈ {"admin", "vendedor", "employee"}.
 *  3. Existe en colección `cafe_users` (doc ID = email) con `role` válido.
 *
 * (3) es el fallback que necesitamos hoy: el POS crea baristas en `cafe_users`
 * sin setear custom claims. Cuando los claims estén en marcha, (1)/(2)
 * cortocircuitan sin tocar Firestore.
 */
import { db } from "./firebase-admin"
import { AuthError, requireAuth, type DecodedToken } from "./require-auth"

export type StaffRole = "admin" | "vendedor" | "employee"

export interface StaffToken extends DecodedToken {
  staffRole: StaffRole
}

const VALID_ROLES = new Set<StaffRole>(["admin", "vendedor", "employee"])

export async function requireStaff(req: Request): Promise<StaffToken> {
  const decoded = await requireAuth(req)

  // Atajo: custom claim ya marca al usuario como staff.
  if (decoded.staff === true) {
    const claimRole = (decoded.role as StaffRole | undefined) ?? "employee"
    return { ...decoded, staffRole: VALID_ROLES.has(claimRole) ? claimRole : "employee" }
  }
  if (decoded.role && VALID_ROLES.has(decoded.role as StaffRole)) {
    return { ...decoded, staffRole: decoded.role as StaffRole }
  }

  // Fallback Firestore: doc ID en cafe_users es el email del barista.
  const email = decoded.email?.toLowerCase()
  if (!email) {
    throw new AuthError("Staff no identificable: token sin email", 403)
  }

  const snap = await db.collection("cafe_users").doc(email).get()
  if (!snap.exists) {
    throw new AuthError("No autorizado: no eres staff de Raíz y Grano", 403)
  }
  const data = snap.data() ?? {}
  const role = data.role as string | undefined
  if (!role || !VALID_ROLES.has(role as StaffRole)) {
    throw new AuthError("No autorizado: rol de staff no válido", 403)
  }

  return { ...decoded, staffRole: role as StaffRole }
}

/** Variante que adicionalmente exige rol admin. */
export async function requireAdmin(req: Request): Promise<StaffToken> {
  const staff = await requireStaff(req)
  if (staff.staffRole !== "admin") {
    throw new AuthError("Solo administradores pueden hacer esta acción", 403)
  }
  return staff
}
