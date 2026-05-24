import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { User } from "firebase/auth"
import {
  validateRedemptionCode,
  useRedemption,
  type ValidateRedemptionResponse,
  type ValidateRedemptionErrorResponse,
  type UseRedemptionResult,
} from "../../../apps/pos/src/lib/redemption-service"

// Mock fetch globally
global.fetch = vi.fn()

describe("redemption-service-client (Brain API client)", () => {
  let mockUser: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock Firebase User
    mockUser = {
      uid: "test-user-123",
      getIdToken: vi.fn().mockResolvedValue("mock-token-xyz"),
    }

    // Reset env var
    process.env.NEXT_PUBLIC_BRAIN_API_URL = "https://brain-api.example.com"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════
  // validateRedemptionCode Tests
  // ═══════════════════════════════════════════════════════════════

  describe("validateRedemptionCode", () => {
    it("sends correct request with bearer token", async () => {
      const orgId = "org-001"
      const code = "ABC123"

      const mockResponse = new Response(
        JSON.stringify({
          valid: true,
          redemption: {
            id: "red-001",
            rewardName: "Coffee",
            rewardNameEn: "Coffee",
            pointsSpent: 100,
            code: "ABC123",
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await validateRedemptionCode(mockUser, orgId, code)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = vi.mocked(global.fetch).mock.calls[0]
      expect(url).toBe("https://brain-api.example.com/api/org/org-001/loyalty/redemption-validate")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ code: "ABC123" }))
      // Headers is a Headers object, check via .get()
      const headers = init?.headers as Headers
      expect(headers.get("Authorization")).toBe("Bearer mock-token-xyz")
      expect(headers.get("Content-Type")).toBe("application/json")
    })

    it("parses valid response correctly", async () => {
      const orgId = "org-001"
      const code = "ABC123"

      const mockResponse = new Response(
        JSON.stringify({
          valid: true,
          redemption: {
            id: "red-001",
            rewardName: "Café",
            rewardNameEn: "Coffee",
            pointsSpent: 100,
            code: "ABC123",
            expiresAt: "2026-03-16T12:00:00Z",
            createdAt: "2026-03-14T12:00:00Z",
          },
        }),
        { status: 200 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await validateRedemptionCode(mockUser, orgId, code)

      expect(result.valid).toBe(true)
      expect((result as ValidateRedemptionResponse).redemption.id).toBe("red-001")
      expect((result as ValidateRedemptionResponse).redemption.rewardName).toBe("Café")
      expect((result as ValidateRedemptionResponse).redemption.pointsSpent).toBe(100)
    })

    it("handles 404 (CODE_NOT_FOUND)", async () => {
      const orgId = "org-001"
      const code = "INVALID"

      const mockResponse = new Response(
        JSON.stringify({ error: "CODE_NOT_FOUND_OR_ALREADY_USED" }),
        { status: 404 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await validateRedemptionCode(mockUser, orgId, code)

      expect(result.valid).toBe(false)
      expect((result as ValidateRedemptionErrorResponse).error).toBe("CODE_NOT_FOUND_OR_ALREADY_USED")
    })

    it("handles 410 (EXPIRED)", async () => {
      const orgId = "org-001"
      const code = "EXPIRED"

      const mockResponse = new Response(
        JSON.stringify({ error: "REDEMPTION_EXPIRED" }),
        { status: 410 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await validateRedemptionCode(mockUser, orgId, code)

      expect(result.valid).toBe(false)
      expect((result as ValidateRedemptionErrorResponse).error).toBe("REDEMPTION_EXPIRED")
    })

    it("handles 401 (throws UNAUTHORIZED)", async () => {
      const orgId = "org-001"
      const code = "ABC123"

      const mockResponse = new Response(
        JSON.stringify({ error: "UNAUTHORIZED" }),
        { status: 401 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await expect(validateRedemptionCode(mockUser, orgId, code)).rejects.toThrow("UNAUTHORIZED")
    })

    it("handles network error", async () => {
      const orgId = "org-001"
      const code = "ABC123"

      vi.mocked(global.fetch).mockRejectedValue(new Error("Network timeout"))

      await expect(validateRedemptionCode(mockUser, orgId, code)).rejects.toThrow("Network timeout")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // useRedemption Tests
  // ═══════════════════════════════════════════════════════════════

  describe("useRedemption", () => {
    it("sends correct request with redemptionId", async () => {
      const orgId = "org-001"
      const redemptionId = "red-001"

      const mockResponse = new Response(
        JSON.stringify({ success: true }),
        { status: 200 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await useRedemption(mockUser, orgId, redemptionId)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = vi.mocked(global.fetch).mock.calls[0]
      expect(url).toBe("https://brain-api.example.com/api/org/org-001/loyalty/redemption-use")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ redemptionId: "red-001" }))
      const headers = init?.headers as Headers
      expect(headers.get("Authorization")).toBe("Bearer mock-token-xyz")
    })

    it("parses success response correctly", async () => {
      const orgId = "org-001"
      const redemptionId = "red-001"

      const mockResponse = new Response(
        JSON.stringify({ success: true }),
        { status: 200 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await useRedemption(mockUser, orgId, redemptionId)

      expect(result.success).toBe(true)
    })

    it("handles 410 (EXPIRED)", async () => {
      const orgId = "org-001"
      const redemptionId = "red-001"

      const mockResponse = new Response(
        JSON.stringify({ error: "REDEMPTION_EXPIRED" }),
        { status: 410 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await useRedemption(mockUser, orgId, redemptionId)

      expect(result.success).toBe(false)
      expect((result as any).error).toBe("REDEMPTION_EXPIRED")
    })

    it("handles 400 (generic error response)", async () => {
      const orgId = "org-001"
      const redemptionId = "red-nonexistent"

      const mockResponse = new Response(
        JSON.stringify({ success: false, error: "REDEMPTION_NOT_FOUND" }),
        { status: 400 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await useRedemption(mockUser, orgId, redemptionId)

      expect(result.success).toBe(false)
      expect((result as any).error).toBe("REDEMPTION_NOT_FOUND")
    })

    it("handles 401 (throws UNAUTHORIZED)", async () => {
      const orgId = "org-001"
      const redemptionId = "red-001"

      const mockResponse = new Response(
        JSON.stringify({ error: "UNAUTHORIZED" }),
        { status: 401 }
      )

      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await expect(useRedemption(mockUser, orgId, redemptionId)).rejects.toThrow("UNAUTHORIZED")
    })

    it("handles network error", async () => {
      const orgId = "org-001"
      const redemptionId = "red-001"

      vi.mocked(global.fetch).mockRejectedValue(new Error("Connection refused"))

      await expect(useRedemption(mockUser, orgId, redemptionId)).rejects.toThrow("Connection refused")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Integration-style Tests
  // ═══════════════════════════════════════════════════════════════

  describe("integration scenarios", () => {
    it("full redemption flow: validate then use", async () => {
      const orgId = "org-001"
      const code = "ABC123"
      const redemptionId = "red-001"

      // First: validate
      const validateResponse = new Response(
        JSON.stringify({
          valid: true,
          redemption: {
            id: redemptionId,
            rewardName: "Café",
            rewardNameEn: "Coffee",
            pointsSpent: 100,
            code,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 200 }
      )

      vi.mocked(global.fetch).mockResolvedValueOnce(validateResponse)

      const validateResult = await validateRedemptionCode(mockUser, orgId, code)
      expect(validateResult.valid).toBe(true)
      expect((validateResult as any).redemption.id).toBe(redemptionId)

      // Second: use
      const useResponse = new Response(
        JSON.stringify({ success: true }),
        { status: 200 }
      )

      vi.mocked(global.fetch).mockResolvedValueOnce(useResponse)

      const useResult = await useRedemption(mockUser, orgId, redemptionId)
      expect(useResult.success).toBe(true)
    })

    it("handles expired redemption in both validate and use", async () => {
      const orgId = "org-001"
      const code = "EXPIRED"
      const redemptionId = "red-expired"

      // Validate returns expired
      const validateResponse = new Response(
        JSON.stringify({ error: "REDEMPTION_EXPIRED" }),
        { status: 410 }
      )

      vi.mocked(global.fetch).mockResolvedValueOnce(validateResponse)

      const validateResult = await validateRedemptionCode(mockUser, orgId, code)
      expect(validateResult.valid).toBe(false)
      expect((validateResult as any).error).toBe("REDEMPTION_EXPIRED")

      // Use also returns expired (double-check on server)
      const useResponse = new Response(
        JSON.stringify({ success: false, error: "REDEMPTION_EXPIRED" }),
        { status: 410 }
      )

      vi.mocked(global.fetch).mockResolvedValueOnce(useResponse)

      const useResult = await useRedemption(mockUser, orgId, redemptionId)
      expect(useResult.success).toBe(false)
    })
  })
})
