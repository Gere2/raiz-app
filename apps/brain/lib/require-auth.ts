/**
 * lib/require-auth.ts — Unified auth helper for Brain API routes
 *
 * Consolidates auth functionality with support for both Request and NextRequest.
 * Exports:
 *   - verifyAuth() - non-throwing, returns token or null
 *   - requireAuth() - throws AuthError if not authenticated
 *   - requireOrgMember() - throws AuthError if org membership fails
 *   - AuthError - custom error class with status code
 *   - DecodedToken - interface for decoded token data
 *
 * Uso:
 *   const { uid, email, staff, role } = await requireAuth(req);
 *   const user = await requireOrgMember(req, orgId);
 *   const tokenOrNull = await verifyAuth(req);
 */
import { adminAuth, db } from "./firebase-admin";

export interface DecodedToken {
  uid: string;
  email?: string | null;
  staff?: boolean;
  role?: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Verify the Bearer token in the Authorization header.
 * Returns decoded token or null if invalid/missing.
 * Supports both Request and NextRequest via the Request base interface.
 */
export async function verifyAuth(
  req: Request
): Promise<DecodedToken | null> {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1];

    if (!token) return null;

    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      staff: decoded.staff === true,
      role: decoded.role as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Require authenticated user. Returns decoded token.
 * Throws AuthError if not authenticated.
 * Supports both Request and NextRequest via the Request base interface.
 */
export async function requireAuth(req: Request): Promise<DecodedToken> {
  const token = await verifyAuth(req);
  if (!token) {
    throw new AuthError("Missing or invalid Authorization Bearer token", 401);
  }
  return token;
}

/**
 * requireOrgMember — verifica token + que el usuario pertenece a la org.
 * Throws AuthError(403) si no es miembro.
 */
export async function requireOrgMember(
  req: Request,
  orgId: string
): Promise<DecodedToken> {
  const user = await requireAuth(req);

  const memberDoc = await db
    .collection("orgs")
    .doc(orgId)
    .collection("members")
    .doc(user.uid)
    .get();

  if (!memberDoc.exists) {
    throw new AuthError("No tienes acceso a esta organización", 403);
  }

  return user;
}
