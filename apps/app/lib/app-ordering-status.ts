"use client";

/**
 * app-ordering-status.ts
 *
 * Estado "abierto / cerrado" de los pedidos por la app, controlado desde el POS.
 * Fuente de verdad: doc Firestore `app_ordering_status/{orgId}` (lectura pública).
 *
 *  - `acceptingOrders`: interruptor manual ("descanso"). Si está en false, cerrado YA.
 *  - `useSchedule`: si true, además respeta el horario semanal por día.
 *  - `hours[0..6]`: horario por día de la semana (0 = domingo … 6 = sábado).
 *  - `closedMessage`: texto que ve la clienta cuando está en pausa manual.
 *  - `timezone`: para evaluar el horario en la hora local del café.
 *
 * La app SOLO lee este doc; el POS lo escribe (ver apps/pos/src/lib/app-ordering-service.ts,
 * que mantiene una copia idéntica de estos tipos — son dos workspaces sin alias compartido).
 */
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// La app es single-tenant (Raíz y Grano), igual que order-service.
export const APP_ORDERING_ORG_ID = "raiz_y_grano";

export interface DayHours {
  closed: boolean;
  open: string;  // "HH:MM"
  close: string; // "HH:MM"
}

export interface AppOrderingStatus {
  acceptingOrders: boolean;
  useSchedule: boolean;
  closedMessage: string;
  hours: Record<number, DayHours>;
  timezone: string;
}

export const DEFAULT_CLOSED_MESSAGE = "Ahora mismo no estamos aceptando pedidos por la app. ¡Vuelve en un rato! 🙏";

const DEFAULT_DAY: DayHours = { closed: false, open: "08:00", close: "20:00" };

export const DEFAULT_STATUS: AppOrderingStatus = {
  acceptingOrders: true,
  useSchedule: false,
  closedMessage: DEFAULT_CLOSED_MESSAGE,
  hours: { 0: { ...DEFAULT_DAY }, 1: { ...DEFAULT_DAY }, 2: { ...DEFAULT_DAY }, 3: { ...DEFAULT_DAY }, 4: { ...DEFAULT_DAY }, 5: { ...DEFAULT_DAY }, 6: { ...DEFAULT_DAY } },
  timezone: "Europe/Madrid",
};

/** Mezcla un doc parcial de Firestore con los defaults (cada día completo). */
export function mergeStatus(raw: unknown): AppOrderingStatus {
  const s = (raw ?? {}) as Partial<AppOrderingStatus>;
  const hours: Record<number, DayHours> = {};
  for (let d = 0; d < 7; d++) {
    hours[d] = { ...DEFAULT_DAY, ...((s.hours as Record<number, DayHours> | undefined)?.[d] ?? {}) };
  }
  return {
    acceptingOrders: s.acceptingOrders !== false, // default true
    useSchedule: s.useSchedule === true,           // default false
    closedMessage: typeof s.closedMessage === "string" && s.closedMessage.trim() ? s.closedMessage : DEFAULT_CLOSED_MESSAGE,
    hours,
    timezone: typeof s.timezone === "string" && s.timezone ? s.timezone : DEFAULT_STATUS.timezone,
  };
}

function hhmmToMinutes(s: string): number {
  const [h, m] = (s || "0:0").split(":").map((n) => parseInt(n, 10));
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Día de la semana (0=dom) y minutos del día en la timezone indicada. */
function nowPartsInTz(tz: string, date: Date): { weekday: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    let hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    if (hh === 24) hh = 0; // algunos entornos devuelven "24" a medianoche
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { weekday: map[wd] ?? 0, minutes: hh * 60 + mm };
  } catch {
    return { weekday: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes() };
  }
}

export type ClosedReason = "open" | "paused" | "off_hours" | "day_closed";

export interface OpenEvaluation {
  open: boolean;
  reason: ClosedReason;
  message: string | null;   // texto a mostrar cuando está cerrado
  todayHours: DayHours | null;
}

/** Evalúa si la app acepta pedidos AHORA según el estado + horario. */
export function evaluateOpen(status: AppOrderingStatus, date: Date = new Date()): OpenEvaluation {
  // 1) Pausa manual (descanso): corta inmediatamente, sin importar el horario.
  if (!status.acceptingOrders) {
    return { open: false, reason: "paused", message: status.closedMessage || DEFAULT_CLOSED_MESSAGE, todayHours: null };
  }
  // 2) Sin horario automático: abierto.
  if (!status.useSchedule) {
    return { open: true, reason: "open", message: null, todayHours: null };
  }
  // 3) Horario semanal por día.
  const { weekday, minutes } = nowPartsInTz(status.timezone, date);
  const today = status.hours?.[weekday] ?? DEFAULT_DAY;
  if (today.closed) {
    return { open: false, reason: "day_closed", message: status.closedMessage || "Hoy está cerrado.", todayHours: today };
  }
  const openM = hhmmToMinutes(today.open);
  const closeM = hhmmToMinutes(today.close);
  // Soporta cierre pasada la medianoche (close < open).
  const within = closeM > openM ? minutes >= openM && minutes < closeM : minutes >= openM || minutes < closeM;
  if (!within) {
    return {
      open: false,
      reason: "off_hours",
      message: `Estamos cerrados. Hoy abrimos de ${today.open} a ${today.close}.`,
      todayHours: today,
    };
  }
  return { open: true, reason: "open", message: null, todayHours: today };
}

/**
 * Hook realtime: se suscribe al doc y reevalúa cada minuto (para que el horario
 * "cierre" solo aunque el documento no cambie).
 */
export function useAppOrderingStatus(): { status: AppOrderingStatus; evaluation: OpenEvaluation; loading: boolean } {
  const [status, setStatus] = useState<AppOrderingStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ref = doc(db, "app_ordering_status", APP_ORDERING_ORG_ID);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setStatus(snap.exists() ? mergeStatus(snap.data()) : DEFAULT_STATUS);
        setLoading(false);
      },
      () => setLoading(false), // fail-open: ante error de permisos/red, quedamos con DEFAULT (abierto)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // `tick` fuerza la reevaluación temporal del horario.
  void tick;
  const evaluation = evaluateOpen(status);
  return { status, evaluation, loading };
}

/**
 * Lectura puntual (sin hook) para el guard del checkout.
 * Fail-open: si no se puede leer el estado, devolvemos "abierto" para no
 * romper ventas por un fallo de infra. El bloqueo principal es la UI realtime.
 */
export async function fetchOrderingEvaluation(orgId: string = APP_ORDERING_ORG_ID): Promise<OpenEvaluation> {
  try {
    const snap = await getDoc(doc(db, "app_ordering_status", orgId));
    const status = snap.exists() ? mergeStatus(snap.data()) : DEFAULT_STATUS;
    return evaluateOpen(status);
  } catch {
    return { open: true, reason: "open", message: null, todayHours: null };
  }
}
