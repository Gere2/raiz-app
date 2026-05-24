/**
 * Translates loyalty/redemption error codes to human-readable Spanish messages
 */
export function translateLoyaltyError(code: string): string {
  const map: Record<string, string> = {
    "INSUFFICIENT_BALANCE": "El cliente no tiene suficientes puntos",
    "EXPIRED": "Este canje ha caducado",
    "ALREADY_USED": "Este canje ya fue utilizado",
    "NOT_FOUND": "Código de canje no encontrado",
    "INVALID_CODE": "Código inválido",
    "REWARD_UNAVAILABLE": "Esta recompensa ya no está disponible",
    "REDEMPTION_EXPIRED": "Código expirado",
    "CODE_NOT_FOUND_OR_ALREADY_USED": "Código no encontrado o ya utilizado",
    "INVALID_STATUS": "Estado no válido",
    "REDEMPTION_NOT_FOUND": "Código no encontrado",
    "ORG_MISMATCH": "Error de organización",
  }
  return map[code] || `Error: ${code}`
}
