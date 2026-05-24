/**
 * Request validators and middleware utilities
 * Handles size limits, content validation, and security checks
 */

/**
 * Maximum request body size in bytes (1 MB)
 * Prevents abuse and protects against malicious large payloads
 */
export const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

/**
 * Validate request body size before processing
 * Throws an error if the body exceeds MAX_BODY_SIZE
 *
 * Usage:
 * ```
 * try {
 *   await validateRequestSize(req);
 *   const body = await req.json();
 * } catch (e) {
 *   // Handle size limit exceeded
 * }
 * ```
 */
export async function validateRequestSize(req: Request): Promise<void> {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_BODY_SIZE) {
      const error = new Error(`Request body too large: ${size} bytes (max: ${MAX_BODY_SIZE} bytes)`);
      (error as any).status = 413; // Payload Too Large
      throw error;
    }
  }
}

/**
 * Safe JSON parse with size validation
 * Combines size check and JSON parsing with error handling
 *
 * Usage:
 * ```
 * try {
 *   const body = await safeJsonParse(req);
 * } catch (e) {
 *   return NextResponse.json({ error: e?.message }, { status: 400 });
 * }
 * ```
 */
export async function safeJsonParse(req: Request): Promise<Record<string, unknown>> {
  try {
    await validateRequestSize(req);
    const body = await req.json();
    if (typeof body !== "object" || body === null) {
      const error = new Error("Request body must be a valid JSON object");
      (error as any).status = 400;
      throw error;
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof SyntaxError) {
      const error = new Error("Invalid JSON in request body");
      (error as any).status = 400;
      throw error;
    }
    throw e;
  }
}
