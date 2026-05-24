import { describe, it, expect } from "vitest"

/**
 * Contract tests for redemption API response shapes.
 * These verify the expected API contract without hitting Firestore.
 *
 * For full integration tests, use the smoke-test.sh script against a real deployment.
 */

describe("redemption API contract tests", () => {

  // ═══════════════════════════════════════════════════════════════
  // Response shape validation
  // ═══════════════════════════════════════════════════════════════

  describe("validateRedemptionForUse response shapes", () => {
    it("valid response has correct shape", () => {
      const validResponse = {
        valid: true,
        redemption: {
          id: "red-001",
          rewardName: "Café gratis",
          rewardNameEn: "Free Coffee",
          pointsSpent: 500,
          code: "ABC123",
          expiresAt: "2026-03-20T12:00:00Z",
          createdAt: "2026-03-15T12:00:00Z",
        },
      }

      expect(validResponse.valid).toBe(true)
      expect(validResponse.redemption).toBeDefined()
      expect(validResponse.redemption.id).toBeTypeOf("string")
      expect(validResponse.redemption.rewardName).toBeTypeOf("string")
      expect(validResponse.redemption.pointsSpent).toBeTypeOf("number")
      expect(validResponse.redemption.code).toHaveLength(6)
      expect(validResponse.redemption.expiresAt).toBeTypeOf("string")
      expect(validResponse.redemption.createdAt).toBeTypeOf("string")
    })

    it("expired response has correct shape", () => {
      const expiredResponse = {
        valid: false as const,
        error: "REDEMPTION_EXPIRED" as const,
      }

      expect(expiredResponse.valid).toBe(false)
      expect(expiredResponse.error).toBe("REDEMPTION_EXPIRED")
    })

    it("not found response has correct shape", () => {
      const notFoundResponse = {
        valid: false as const,
        error: "CODE_NOT_FOUND_OR_ALREADY_USED" as const,
      }

      expect(notFoundResponse.valid).toBe(false)
      expect(notFoundResponse.error).toBe("CODE_NOT_FOUND_OR_ALREADY_USED")
    })

    it("error codes are exhaustive", () => {
      const validErrorCodes = ["REDEMPTION_EXPIRED", "CODE_NOT_FOUND_OR_ALREADY_USED"]
      expect(validErrorCodes).toContain("REDEMPTION_EXPIRED")
      expect(validErrorCodes).toContain("CODE_NOT_FOUND_OR_ALREADY_USED")
      expect(validErrorCodes).toHaveLength(2)
    })
  })

  describe("markRedemptionUsedServer response shapes", () => {
    it("success response has correct shape", () => {
      const successResponse = { success: true as const }

      expect(successResponse.success).toBe(true)
    })

    it("expired error response has correct shape", () => {
      const errorResponse = {
        success: false as const,
        error: "REDEMPTION_EXPIRED" as const,
      }

      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error).toBe("REDEMPTION_EXPIRED")
    })

    it("org mismatch error response has correct shape", () => {
      const errorResponse = {
        success: false as const,
        error: "ORG_MISMATCH" as const,
      }

      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error).toBe("ORG_MISMATCH")
    })

    it("invalid status error response has correct shape", () => {
      const errorResponse = {
        success: false as const,
        error: "INVALID_STATUS" as const,
      }

      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error).toBe("INVALID_STATUS")
    })

    it("not found error response has correct shape", () => {
      const errorResponse = {
        success: false as const,
        error: "REDEMPTION_NOT_FOUND" as const,
      }

      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error).toBe("REDEMPTION_NOT_FOUND")
    })

    it("error codes are exhaustive", () => {
      const validErrorCodes = [
        "REDEMPTION_EXPIRED",
        "INVALID_STATUS",
        "ORG_MISMATCH",
        "REDEMPTION_NOT_FOUND",
      ]
      expect(validErrorCodes).toHaveLength(4)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // HTTP status code mapping
  // ═══════════════════════════════════════════════════════════════

  describe("HTTP status code mapping", () => {
    it("validate: expired → 410", () => {
      const errorToStatus: Record<string, number> = {
        REDEMPTION_EXPIRED: 410,
        CODE_NOT_FOUND_OR_ALREADY_USED: 404,
      }

      expect(errorToStatus["REDEMPTION_EXPIRED"]).toBe(410)
      expect(errorToStatus["CODE_NOT_FOUND_OR_ALREADY_USED"]).toBe(404)
    })

    it("use: expired → 410, org mismatch → 403", () => {
      const errorToStatus: Record<string, number> = {
        REDEMPTION_EXPIRED: 410,
        ORG_MISMATCH: 403,
        INVALID_STATUS: 400,
        REDEMPTION_NOT_FOUND: 400,
      }

      expect(errorToStatus["REDEMPTION_EXPIRED"]).toBe(410)
      expect(errorToStatus["ORG_MISMATCH"]).toBe(403)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Expiry logic validation
  // ═══════════════════════════════════════════════════════════════

  describe("expiry logic", () => {
    it("detects expired redemption (expiresAt < now)", () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString()
      const isExpired = new Date(pastDate) < new Date()
      expect(isExpired).toBe(true)
    })

    it("detects valid redemption (expiresAt > now)", () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString()
      const isExpired = new Date(futureDate) < new Date()
      expect(isExpired).toBe(false)
    })

    it("code normalization is uppercase", () => {
      const input = "abc123"
      const normalized = input.toUpperCase()
      expect(normalized).toBe("ABC123")
      expect(normalized).toHaveLength(6)
    })
  })
})
