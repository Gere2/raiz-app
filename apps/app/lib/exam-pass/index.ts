/**
 * Bono Supervivencia Exámenes — barrel.
 *
 * Punto de entrada único:
 *   import { computeOrder, formatPremiumProductLabel, ... } from "@/lib/exam-pass"
 *
 * Mantén las importaciones internas (entre archivos del módulo) usando rutas
 * relativas — este barrel es solo para consumidores externos.
 */

export * from "./types"
export * from "./config"
export * from "./calc"
export * from "./format"
export * from "./client-service"
export * from "./use-exam-pass"
