/**
 * Mapeo único de errores de la engine → códigos HTTP + códigos estables
 * para el cliente. Todos los routes del bono usan esto: garantiza que el
 * cliente reciba siempre el mismo `error` para el mismo problema.
 */
import { NextResponse } from "next/server"
import type { OrderValidationError, EligibilityReason } from "./types"

/** Códigos estables que el cliente puede esperar y traducir a UI. */
export type ExamPassErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "INVALID_SELECTION"
  | "PRODUCT_NOT_FOUND"
  | "NO_ACTIVE_PASS"
  | "ACTIVE_PASS_EXISTS"
  | "PASS_PENDING_PAYMENT"
  | "PASS_EXPIRED"
  | "NO_CREDITS"
  | "PAYMENT_REQUIRED"
  | "REDEMPTION_NOT_FOUND"
  | "INVALID_STATE"
  | "PAYMENT_INTENT_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "PASS_NOT_FOUND"
  | "PRICE_DRIFT"
  | "STRIPE_ERROR"
  | "INTERNAL_ERROR"

interface ErrorBody {
  error: ExamPassErrorCode
  message?: string
  /** Datos adicionales para la UI (ej. créditos restantes en eligibility). */
  details?: Record<string, unknown>
}

const STATUS_FOR: Record<ExamPassErrorCode, number> = {
  UNAUTHORIZED: 401,
  INVALID_INPUT: 400,
  INVALID_SELECTION: 400,
  PRODUCT_NOT_FOUND: 400,
  NO_ACTIVE_PASS: 404,
  PASS_NOT_FOUND: 404,
  REDEMPTION_NOT_FOUND: 404,
  ACTIVE_PASS_EXISTS: 409,
  PASS_PENDING_PAYMENT: 409,
  PASS_EXPIRED: 409,
  NO_CREDITS: 409,
  INVALID_STATE: 409,
  PAYMENT_REQUIRED: 402,
  PAYMENT_INTENT_MISMATCH: 409,
  AMOUNT_MISMATCH: 409,
  PRICE_DRIFT: 409,
  STRIPE_ERROR: 502,
  INTERNAL_ERROR: 500,
}

export function errorResponse(
  code: ExamPassErrorCode,
  options: { message?: string; details?: Record<string, unknown> } = {},
): NextResponse {
  const body: ErrorBody = { error: code }
  if (options.message) body.message = options.message
  if (options.details) body.details = options.details
  return NextResponse.json(body, { status: STATUS_FOR[code] })
}

/** Traduce un error de validación de orden (puro) al código del cliente. */
export function orderErrorToCode(err: OrderValidationError): ExamPassErrorCode {
  switch (err) {
    case "PRODUCT_NOT_FOUND":
      return "PRODUCT_NOT_FOUND"
    case "MILK_NOT_ALLOWED_FOR_PRODUCT":
    case "MILK_INVALID":
    case "EXTRA_INVALID":
    case "EXTRA_ICED_REDUNDANT":
    case "PASTRY_INVALID":
      return "INVALID_SELECTION"
  }
}

/** Traduce un motivo de elegibilidad al código del cliente. */
export function eligibilityToCode(reason: EligibilityReason): ExamPassErrorCode {
  switch (reason) {
    case "PASS_NOT_FOUND":
      return "NO_ACTIVE_PASS"
    case "PASS_PENDING_PAYMENT":
      return "PASS_PENDING_PAYMENT"
    case "PASS_NOT_ACTIVE":
      return "NO_ACTIVE_PASS"
    case "PASS_EXPIRED":
      return "PASS_EXPIRED"
    case "NO_CREDITS":
      return "NO_CREDITS"
  }
}
