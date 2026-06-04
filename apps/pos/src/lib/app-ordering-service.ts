/**
 * app-ordering-service.ts (POS)
 *
 * Escribe/lee el estado "abierto / cerrado" de los pedidos por la app.
 * Doc Firestore: `app_ordering_status/{orgId}` (lectura pública, escritura de
 * miembro de la org). La app SOLO lee este doc; el POS lo gestiona desde
 * Configuración. Los tipos son una copia idéntica de
 * apps/app/lib/app-ordering-status.ts (dos workspaces sin alias compartido).
 */
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface DayHours {
  closed: boolean
  open: string  // "HH:MM"
  close: string // "HH:MM"
}

export interface AppOrderingStatus {
  acceptingOrders: boolean
  useSchedule: boolean
  closedMessage: string
  hours: Record<number, DayHours>
  timezone: string
}

// 0 = domingo … 6 = sábado (coincide con Date.getDay()).
export const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

export const DEFAULT_CLOSED_MESSAGE = "Ahora mismo no estamos aceptando pedidos por la app. ¡Vuelve en un rato! 🙏"

const DEFAULT_DAY: DayHours = { closed: false, open: "08:00", close: "20:00" }

export function defaultAppOrderingStatus(): AppOrderingStatus {
  const hours: Record<number, DayHours> = {}
  for (let d = 0; d < 7; d++) hours[d] = { ...DEFAULT_DAY }
  return {
    acceptingOrders: true,
    useSchedule: false,
    closedMessage: DEFAULT_CLOSED_MESSAGE,
    hours,
    timezone: "Europe/Madrid",
  }
}

function mergeStatus(raw: unknown): AppOrderingStatus {
  const s = (raw ?? {}) as Partial<AppOrderingStatus>
  const base = defaultAppOrderingStatus()
  const hours: Record<number, DayHours> = {}
  for (let d = 0; d < 7; d++) {
    hours[d] = { ...DEFAULT_DAY, ...((s.hours as Record<number, DayHours> | undefined)?.[d] ?? {}) }
  }
  return {
    acceptingOrders: s.acceptingOrders !== false,
    useSchedule: s.useSchedule === true,
    closedMessage: typeof s.closedMessage === "string" && s.closedMessage.trim() ? s.closedMessage : base.closedMessage,
    hours,
    timezone: typeof s.timezone === "string" && s.timezone ? s.timezone : base.timezone,
  }
}

const statusRef = (orgId: string) => doc(db, "app_ordering_status", orgId)

export async function getAppOrderingStatus(orgId: string): Promise<AppOrderingStatus> {
  if (!orgId) throw new Error("orgId es requerido")
  const snap = await getDoc(statusRef(orgId))
  return snap.exists() ? mergeStatus(snap.data()) : defaultAppOrderingStatus()
}

export async function saveAppOrderingStatus(orgId: string, data: AppOrderingStatus): Promise<void> {
  if (!orgId) throw new Error("orgId es requerido")
  await setDoc(statusRef(orgId), { ...data, orgId, updatedAt: serverTimestamp() }, { merge: true })
}
