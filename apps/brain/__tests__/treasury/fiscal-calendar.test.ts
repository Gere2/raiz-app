/**
 * __tests__/treasury/fiscal-calendar.test.ts
 *
 * Calendario fiscal AEAT (fase Enverde). Lib pura, sin Firestore ni IA:
 * fechas estáticas + cálculo de daysUntil/urgency/perfil. Portado del demo
 * del marketplace (lib/cafe/fiscal-calendar) al panel real del brain.
 */

import { describe, it, expect } from "vitest";
import {
  getUpcomingObligations,
  asBusinessProfile,
  BUSINESS_PROFILES,
  DEFAULT_BUSINESS_PROFILE,
} from "../../lib/treasury/fiscal-calendar";

// Snapshot date: 2026-05-26. La próxima obligación es el 2T (vto 2026-07-20),
// 55 días después.
const TODAY = new Date("2026-05-26T00:00:00Z");

describe("getUpcomingObligations — orden y vencimientos", () => {
  it("la primera es el 303 del 2T a 55 días (scheduled)", () => {
    const upcoming = getUpcomingObligations(TODAY, { limit: 5 });
    expect(upcoming.length).toBe(5);
    expect(upcoming[0].code).toBe("303");
    expect(upcoming[0].dueAt).toBe("2026-07-20");
    expect(upcoming[0].daysUntil).toBe(55);
    expect(upcoming[0].urgency).toBe("scheduled");
  });

  it("el 2T cubre los 4 modelos (303/130/111/115) y no hay vencidas", () => {
    const upcoming = getUpcomingObligations(TODAY, { limit: 5 });
    const codes2T = upcoming.slice(0, 4).map((o) => o.code).sort();
    expect(codes2T).toEqual(["111", "115", "130", "303"]);
    expect(upcoming.every((o) => o.daysUntil >= 0)).toBe(true);
  });

  it("respeta limit", () => {
    expect(getUpcomingObligations(TODAY, { limit: 2 }).length).toBe(2);
  });
});

describe("getUpcomingObligations — urgencia", () => {
  it("5 días → due_soon", () => {
    const r = getUpcomingObligations(new Date("2026-07-15T00:00:00Z"), { limit: 4 });
    expect(r[0].urgency).toBe("due_soon");
    expect(r[0].daysUntil).toBe(5);
  });

  it("30 días → approaching", () => {
    const r = getUpcomingObligations(new Date("2026-06-20T00:00:00Z"), { limit: 1 });
    expect(r[0].urgency).toBe("approaching");
  });
});

describe("getUpcomingObligations — condicionales y perfil", () => {
  it("includeConditional=false oculta las condicionales (111/115)", () => {
    const r = getUpcomingObligations(TODAY, { limit: 5, includeConditional: false });
    expect(r.every((o) => !o.conditional)).toBe(true);
  });

  it("S.L. ve 202/303 pero no 130/100", () => {
    const codes = getUpcomingObligations(TODAY, { limit: 12, profile: "sl" }).map((o) => o.code);
    expect(codes.includes("130")).toBe(false);
    expect(codes.includes("100")).toBe(false);
    expect(codes.includes("202")).toBe(true);
    expect(codes.includes("303")).toBe(true);
  });

  it("autónomo ve 130 pero nunca 202/200", () => {
    const codes = getUpcomingObligations(TODAY, { limit: 12, profile: "autonomo" }).map((o) => o.code);
    expect(codes.includes("130")).toBe(true);
    expect(codes.includes("202")).toBe(false);
    expect(codes.includes("200")).toBe(false);
  });

  it("sin profile = autónomo (back-compat)", () => {
    const codes = getUpcomingObligations(TODAY, { limit: 12 }).map((o) => o.code);
    expect(codes.includes("130")).toBe(true);
    expect(codes.includes("202")).toBe(false);
  });
});

describe("asBusinessProfile — normalización", () => {
  it("default es autónomo y los perfiles soportados", () => {
    expect(DEFAULT_BUSINESS_PROFILE).toBe("autonomo");
    expect([...BUSINESS_PROFILES]).toEqual(["autonomo", "sl"]);
  });

  it("válidos pasan; case/corruptos/null/undefined caen al default", () => {
    expect(asBusinessProfile("sl")).toBe("sl");
    expect(asBusinessProfile("autonomo")).toBe("autonomo");
    expect(asBusinessProfile("SL")).toBe("autonomo");
    expect(asBusinessProfile(undefined)).toBe("autonomo");
    expect(asBusinessProfile(null)).toBe("autonomo");
    expect(asBusinessProfile("pyme")).toBe("autonomo");
  });
});
