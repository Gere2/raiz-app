/**
 * lib/api-auth.ts — DEPRECATED
 *
 * This module has been consolidated into lib/require-auth.ts
 * Re-exporting for backwards compatibility during migration.
 *
 * NEW CODE: Import from @/lib/require-auth instead
 */

export { verifyAuth, requireAuth, AuthError } from "./require-auth"
export type { DecodedToken } from "./require-auth"
