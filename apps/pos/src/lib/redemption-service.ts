"use client"

import type { User } from "firebase/auth"
import { authedFetch } from "./authed-fetch"

/**
 * redemption-service.ts (POS)
 *
 * Validates and marks loyalty redemption codes as used.
 * Calls same-origin POS proxy routes that forward to Brain server-side
 * (avoids browser CORS issues when calling Brain cross-origin).
 */

// TypeScript interfaces for API responses
export interface ValidateRedemptionResponse {
  valid: true
  redemption: {
    id: string
    rewardName: string
    rewardNameEn: string
    pointsSpent: number
    code: string
    expiresAt: string
    createdAt: string
  }
}

export interface ValidateRedemptionErrorResponse {
  valid: false
  error: "REDEMPTION_EXPIRED" | "CODE_NOT_FOUND_OR_ALREADY_USED"
}

export type ValidateRedemptionResult = ValidateRedemptionResponse | ValidateRedemptionErrorResponse

export interface UseRedemptionSuccessResponse {
  success: true
}

export interface UseRedemptionErrorResponse {
  success: false
  error:
    | "REDEMPTION_EXPIRED"
    | "INVALID_STATUS"
    | "ORG_MISMATCH"
    | "REDEMPTION_NOT_FOUND"
}

export type UseRedemptionResult = UseRedemptionSuccessResponse | UseRedemptionErrorResponse

/**
 * Validate a redemption code via the POS proxy route (same-origin).
 * @param user Firebase user (must have staff: true in custom claims)
 * @param orgId Organization ID
 * @param code 6-character redemption code
 * @returns Typed response with validation result or error
 */
export async function validateRedemptionCode(
  user: User,
  orgId: string,
  code: string,
): Promise<ValidateRedemptionResult> {
  const path = `/api/org/${orgId}/loyalty/redemption-validate`

  try {
    console.log(
      JSON.stringify({
        op: "redemption.validate.request",
        orgId,
        code,
        userId: user.uid,
        ts: new Date().toISOString(),
      }),
    )

    const response = await authedFetch(user, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Log error response
      console.log(
        JSON.stringify({
          op: "redemption.validate.error",
          orgId,
          code,
          status: response.status,
          error: data.error,
          ts: new Date().toISOString(),
        }),
      )

      // Map HTTP status to error type
      if (response.status === 410) {
        return { valid: false, error: "REDEMPTION_EXPIRED" }
      }
      if (response.status === 404) {
        return { valid: false, error: "CODE_NOT_FOUND_OR_ALREADY_USED" }
      }
      if (response.status === 401) {
        throw new Error("UNAUTHORIZED")
      }
      if (response.status === 403) {
        throw new Error("FORBIDDEN")
      }
      // Generic 5xx errors
      throw new Error(`HTTP ${response.status}`)
    }

    console.log(
      JSON.stringify({
        op: "redemption.validate.success",
        orgId,
        code,
        redemptionId: data.redemption?.id,
        ts: new Date().toISOString(),
      }),
    )

    return data as ValidateRedemptionResponse
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    // Log network/parse errors
    console.log(
      JSON.stringify({
        op: "redemption.validate.exception",
        orgId,
        code,
        error: errorMsg,
        ts: new Date().toISOString(),
      }),
    )

    // Re-throw to let caller handle (will show appropriate UI error)
    throw err
  }
}

/**
 * Mark a redemption as used via Brain API
 * @param user Firebase user (must have staff: true in custom claims)
 * @param orgId Organization ID
 * @param redemptionId ID of the redemption to mark as used
 * @returns Typed response with success or error
 */
export async function useRedemption(
  user: User,
  orgId: string,
  redemptionId: string,
): Promise<UseRedemptionResult> {
  const path = `/api/org/${orgId}/loyalty/redemption-use`

  try {
    console.log(
      JSON.stringify({
        op: "redemption.use.request",
        orgId,
        redemptionId,
        userId: user.uid,
        ts: new Date().toISOString(),
      }),
    )

    const response = await authedFetch(user, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redemptionId }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Log error response
      console.log(
        JSON.stringify({
          op: "redemption.use.error",
          orgId,
          redemptionId,
          status: response.status,
          error: data.error,
          ts: new Date().toISOString(),
        }),
      )

      // Map HTTP status to error type
      if (response.status === 410) {
        return { success: false, error: "REDEMPTION_EXPIRED" }
      }
      if (response.status === 403) {
        // Could be ORG_MISMATCH or staff check
        return data as UseRedemptionErrorResponse
      }
      if (response.status === 401) {
        throw new Error("UNAUTHORIZED")
      }
      // 400 or other errors
      if (data.error) {
        return data as UseRedemptionErrorResponse
      }
      throw new Error(`HTTP ${response.status}`)
    }

    console.log(
      JSON.stringify({
        op: "redemption.use.success",
        orgId,
        redemptionId,
        ts: new Date().toISOString(),
      }),
    )

    return data as UseRedemptionSuccessResponse
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    // Log network/parse errors
    console.log(
      JSON.stringify({
        op: "redemption.use.exception",
        orgId,
        redemptionId,
        error: errorMsg,
        ts: new Date().toISOString(),
      }),
    )

    // Re-throw to let caller handle
    throw err
  }
}
