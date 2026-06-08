/**
 * Calendario fiscal AEAT para cafeterías pequeñas. Datos estáticos verificables
 * contra la sede electrónica de la AEAT. Dos perfiles seleccionables:
 *   - "autonomo" (default): régimen general de IVA + IRPF (130 trimestral, 100
 *     Renta anual). El 90 % de cafeterías de barrio caen aquí.
 *   - "sl": Sociedad Limitada → sustituye el IRPF por Impuesto de Sociedades
 *     (202 pagos fraccionados, 200 declaración anual). IVA y retenciones
 *     (303/390/111/115/180/190/347) son comunes a ambos perfiles.
 *
 * Fechas usan plazo SIN domiciliación bancaria (más holgado). Si el dueño
 * domicilia, el plazo se acorta 5 días (típicamente al día 15 en lugar de 20).
 * Preferimos mostrar la fecha tope absoluta — el dueño puede adelantar.
 *
 * Pendiente: el perfil sale de un selector en la UI, no del dato legal de la
 * org (no lo guardamos aún). Si se añade `legalForm` al perfil de negocio,
 * derivarlo de ahí en vez del toggle.
 */

/** Formas jurídicas soportadas. Fuente única de verdad: la consumen el selector
 *  de la card, la ruta /api/v1/org/settings que persiste `legalForm` en el org,
 *  y el filtro de obligaciones de abajo. Añadir una nueva forma aquí la propaga
 *  a los tres sitios. */
export const BUSINESS_PROFILES = ["autonomo", "sl"] as const;

/** Forma jurídica del negocio. Determina IRPF (autónomo) vs Impuesto de
 *  Sociedades (S.L.). El IVA y las retenciones son comunes a ambos. */
export type BusinessProfile = (typeof BUSINESS_PROFILES)[number];

/** Default cuando el org no tiene `legalForm` guardado (el 90 % del target es
 *  autónomo). También es el fallback de `asBusinessProfile`. */
export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = "autonomo";

/** Normaliza un valor sin tipar (body de API, localStorage, doc de Firestore) a
 *  un BusinessProfile válido. Cualquier cosa no reconocida cae al default —
 *  así un dato corrupto nunca rompe el calendario, sólo muestra autónomo. */
export function asBusinessProfile(value: unknown): BusinessProfile {
  return BUSINESS_PROFILES.includes(value as BusinessProfile)
    ? (value as BusinessProfile)
    : DEFAULT_BUSINESS_PROFILE;
}

export type FiscalObligation = {
  /** Código AEAT del modelo. */
  code: string;
  /** Nombre amigable. */
  name: string;
  /** Periodo cubierto, para texto contextual. */
  period: string;
  /** Fecha límite de presentación (sin domiciliación). ISO YYYY-MM-DD. */
  dueAt: string;
  /** Una línea explicativa de quién aplica. */
  appliesTo: string;
  /** Aplica siempre (true) o sólo bajo ciertas condiciones (false — ej. 111
   *  sólo si hay nómina). */
  conditional: boolean;
  /** Perfiles a los que aplica. Omitido = ambos (IVA, retenciones, 347…). */
  profiles?: BusinessProfile[];
};

/**
 * Obligaciones desde mayo 2026 hasta junio 2027. Mantener actualizado:
 *  - Cada cambio de año fiscal: revisar 2027-2028 y prepend.
 *  - Si la AEAT publica una OM que mueva fechas, actualizar aquí.
 *
 * Verificado: sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/
 * calendario.html (formato canónico AEAT).
 */
const OBLIGATIONS_2026_2027: FiscalObligation[] = [
  // === 2T 2026 ===
  {
    code: "303",
    name: "IVA trimestral",
    period: "2T 2026 (abril-junio)",
    dueAt: "2026-07-20",
    appliesTo: "Toda cafetería en régimen general de IVA.",
    conditional: false,
  },
  {
    code: "130",
    name: "Pago fraccionado IRPF",
    period: "2T 2026 (abril-junio)",
    dueAt: "2026-07-20",
    appliesTo: "Autónomos en estimación directa.",
    conditional: false,
    profiles: ["autonomo"],
  },
  {
    code: "111",
    name: "Retenciones a trabajadores y profesionales",
    period: "2T 2026 (abril-junio)",
    dueAt: "2026-07-20",
    appliesTo: "Si tienes empleados o pagaste a profesionales con retención.",
    conditional: true,
  },
  {
    code: "115",
    name: "Retenciones alquiler de local",
    period: "2T 2026 (abril-junio)",
    dueAt: "2026-07-20",
    appliesTo: "Si tu local está en alquiler.",
    conditional: true,
  },

  // === 3T 2026 ===
  {
    code: "303",
    name: "IVA trimestral",
    period: "3T 2026 (julio-septiembre)",
    dueAt: "2026-10-20",
    appliesTo: "Toda cafetería en régimen general de IVA.",
    conditional: false,
  },
  {
    code: "130",
    name: "Pago fraccionado IRPF",
    period: "3T 2026 (julio-septiembre)",
    dueAt: "2026-10-20",
    appliesTo: "Autónomos en estimación directa.",
    conditional: false,
    profiles: ["autonomo"],
  },
  {
    code: "111",
    name: "Retenciones a trabajadores y profesionales",
    period: "3T 2026 (julio-septiembre)",
    dueAt: "2026-10-20",
    appliesTo: "Si tienes empleados o pagaste a profesionales con retención.",
    conditional: true,
  },
  {
    code: "115",
    name: "Retenciones alquiler de local",
    period: "3T 2026 (julio-septiembre)",
    dueAt: "2026-10-20",
    appliesTo: "Si tu local está en alquiler.",
    conditional: true,
  },

  // === 4T 2026 + cierre anual (presentación enero 2027) ===
  {
    code: "303",
    name: "IVA trimestral",
    period: "4T 2026 (octubre-diciembre)",
    dueAt: "2027-01-30",
    appliesTo: "Toda cafetería en régimen general de IVA.",
    conditional: false,
  },
  {
    code: "130",
    name: "Pago fraccionado IRPF",
    period: "4T 2026 (octubre-diciembre)",
    dueAt: "2027-01-30",
    appliesTo: "Autónomos en estimación directa.",
    conditional: false,
    profiles: ["autonomo"],
  },
  {
    code: "111",
    name: "Retenciones a trabajadores y profesionales",
    period: "4T 2026 (octubre-diciembre)",
    dueAt: "2027-01-20",
    appliesTo: "Si tienes empleados o pagaste a profesionales con retención.",
    conditional: true,
  },
  {
    code: "115",
    name: "Retenciones alquiler de local",
    period: "4T 2026 (octubre-diciembre)",
    dueAt: "2027-01-20",
    appliesTo: "Si tu local está en alquiler.",
    conditional: true,
  },
  {
    code: "390",
    name: "Resumen anual de IVA",
    period: "Ejercicio 2026",
    dueAt: "2027-01-30",
    appliesTo: "Toda cafetería en régimen general de IVA.",
    conditional: false,
  },
  {
    code: "180",
    name: "Resumen anual de retenciones por alquileres",
    period: "Ejercicio 2026",
    dueAt: "2027-01-31",
    appliesTo: "Si tu local está en alquiler.",
    conditional: true,
  },
  {
    code: "190",
    name: "Resumen anual de retenciones (nóminas y profesionales)",
    period: "Ejercicio 2026",
    dueAt: "2027-01-31",
    appliesTo: "Si tienes empleados o pagaste a profesionales con retención.",
    conditional: true,
  },

  // === Anuales 2026 ===
  {
    code: "347",
    name: "Declaración anual de operaciones con terceros",
    period: "Ejercicio 2026",
    dueAt: "2027-02-28",
    appliesTo: "Si has tenido operaciones >3.000 € con un mismo cliente o proveedor.",
    conditional: true,
  },
  {
    code: "100",
    name: "IRPF — Declaración de la Renta",
    period: "Ejercicio 2026",
    dueAt: "2027-06-30",
    appliesTo: "Autónomos.",
    conditional: false,
    profiles: ["autonomo"],
  },

  // === S.L. — Impuesto de Sociedades (modelo 200/202) ===
  // Sólo Sociedad Limitada. El autónomo usa 130/100 en su lugar; IVA y
  // retenciones (303/390/111/115/180/190/347) son comunes a ambos.
  {
    code: "202",
    name: "Pago fraccionado del Impuesto de Sociedades",
    period: "2.º pago 2026 (octubre)",
    dueAt: "2026-10-20",
    appliesTo: "S.L. cuyo último Impuesto de Sociedades salió a pagar.",
    conditional: true,
    profiles: ["sl"],
  },
  {
    code: "202",
    name: "Pago fraccionado del Impuesto de Sociedades",
    period: "3.er pago 2026 (diciembre)",
    dueAt: "2026-12-20",
    appliesTo: "S.L. cuyo último Impuesto de Sociedades salió a pagar.",
    conditional: true,
    profiles: ["sl"],
  },
  {
    code: "202",
    name: "Pago fraccionado del Impuesto de Sociedades",
    period: "1.er pago 2027 (abril)",
    dueAt: "2027-04-20",
    appliesTo: "S.L. cuyo último Impuesto de Sociedades salió a pagar.",
    conditional: true,
    profiles: ["sl"],
  },
  {
    code: "200",
    name: "Impuesto de Sociedades (declaración anual)",
    period: "Ejercicio 2026",
    dueAt: "2027-07-25",
    appliesTo: "Toda S.L. (plazo: 25 días tras los 6 meses del cierre; ejercicio natural → julio).",
    conditional: false,
    profiles: ["sl"],
  },
];

/**
 * Devuelve las próximas N obligaciones desde la fecha dada para un perfil.
 * Las ya vencidas se descartan. Si `includeConditional` es false (default
 * true), se omiten las que dependen de tener empleados, alquiler, etc.
 * `profile` (default "autonomo") elige IRPF (130/100) vs Sociedades (202/200);
 * las comunes (IVA, retenciones) salen en ambos.
 */
export function getUpcomingObligations(
  from: Date,
  options: { limit?: number; includeConditional?: boolean; profile?: BusinessProfile } = {}
): Array<FiscalObligation & { daysUntil: number; urgency: "due_soon" | "approaching" | "scheduled" }> {
  const { limit = 5, includeConditional = true, profile = "autonomo" } = options;
  const today = startOfUtcDay(from);
  const list = OBLIGATIONS_2026_2027
    .filter((o) => !o.profiles || o.profiles.includes(profile))
    .filter((o) => includeConditional || !o.conditional)
    .map((o) => {
      const due = new Date(`${o.dueAt}T00:00:00Z`);
      const daysUntil = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const urgency: "due_soon" | "approaching" | "scheduled" =
        daysUntil <= 14 ? "due_soon" : daysUntil <= 45 ? "approaching" : "scheduled";
      return { ...o, daysUntil, urgency };
    })
    .filter((o) => o.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
  return list;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
