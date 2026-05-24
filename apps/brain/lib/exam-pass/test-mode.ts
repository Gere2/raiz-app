/**
 * Modo test del Bono Exámenes — guard server-side.
 *
 * Solo se activa con env `ENABLE_EXAM_PASS_TEST_MODE === "true"`. Cualquier
 * otro valor (vacío, "false", "1", etc.) lo deja desactivado por defecto.
 *
 * Cuando está OFF, las rutas /test/* devuelven 404 (Not Found) — no 403,
 * para que parezca que ni existen. Esto evita filtrar la presencia del modo
 * test en producción.
 */
import { NextResponse } from "next/server"

/** True solo si la flag está explícitamente habilitada en el server. */
export function isExamPassTestModeEnabled(): boolean {
  return process.env.ENABLE_EXAM_PASS_TEST_MODE === "true"
}

/**
 * Devuelve un 404 estándar para rutas /test cuando el modo está deshabilitado.
 * Mismo shape que cualquier 404 de Next, sin pistas de que sea por flag.
 */
export function testModeDisabled(): NextResponse {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
}
