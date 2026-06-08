"use client";

/**
 * Calendario fiscal — próximas obligaciones AEAT de la cafetería.
 * Portado del demo (marketplace lib/cafe/fiscal-calendar) al panel real del
 * brain. Datos estáticos verificables contra la AEAT, calculados en cliente:
 * ni IA ni endpoint. El perfil (autónomo / S.L.) sale de un toggle local;
 * default autónomo (el 90 % del target). Cuando el org guarde `legalForm`,
 * derivarlo de ahí en vez del toggle.
 */

import { useMemo, useState } from "react";
import { T } from "../../theme";
import {
  getUpcomingObligations,
  BUSINESS_PROFILES,
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "../../../../lib/treasury/fiscal-calendar";

const PROFILE_LABEL: Record<BusinessProfile, string> = {
  autonomo: "Autónomo",
  sl: "Sociedad Limitada",
};

const urgencyColor = (u: "due_soon" | "approaching" | "scheduled") =>
  u === "due_soon" ? T.danger : u === "approaching" ? T.warning : T.success;

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[(m ?? 1) - 1]} ${y}`;
}

export default function FiscalCalendar() {
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  const obligations = useMemo(
    () => getUpcomingObligations(new Date(), { limit: 6, profile, includeConditional: true }),
    [profile]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: T.text }}>Próximas obligaciones fiscales</h3>
          <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
            Modelos de la AEAT y su fecha tope, ordenados por urgencia. Te avisamos antes de que venza el 303.
          </p>
        </div>
        {/* Forma jurídica: cambia 130/100 (autónomo) por 202/200 (S.L.). */}
        <div style={{ display: "inline-flex", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
          {BUSINESS_PROFILES.map((p) => {
            const active = profile === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setProfile(p)}
                aria-pressed={active}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  fontFamily: T.font,
                  background: active ? T.accentLight : T.surface,
                  color: active ? T.accent : T.muted,
                }}
              >
                {PROFILE_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      {obligations.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {obligations.map((o) => {
            const color = urgencyColor(o.urgency);
            return (
              <div
                key={`${o.code}-${o.dueAt}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 16px",
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 10,
                }}
              >
                <span
                  style={{
                    minWidth: 48,
                    textAlign: "center",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: T.accentLight,
                    color: T.accent,
                    fontFamily: T.mono,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {o.code}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{o.name}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                    {o.period} · {o.appliesTo}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>
                    {o.daysUntil === 0 ? "Hoy" : o.daysUntil === 1 ? "Mañana" : `En ${o.daysUntil} días`}
                  </div>
                  <div style={{ fontSize: 12, color: T.dim, fontFamily: T.mono, marginTop: 2 }}>
                    {formatDueDate(o.dueAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📅</p>
          <p style={{ fontSize: 14 }}>No hay obligaciones próximas en el calendario.</p>
        </div>
      )}

      <p style={{ margin: "16px 0 0", color: T.dim, fontSize: 12, lineHeight: 1.5 }}>
        Fechas tope sin domiciliación · fuente AEAT. Las condicionales (nóminas, alquiler) solo aparecen si te aplican.
      </p>
    </div>
  );
}
