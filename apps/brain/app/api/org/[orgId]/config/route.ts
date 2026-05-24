import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * Org config — configurable settings per organization.
 * Replaces all hardcoded values (GPS, food cost thresholds, calendar, stations).
 *
 * GET  /api/org/[orgId]/config → current config (with defaults)
 * PATCH /api/org/[orgId]/config → partial update
 */

export interface OrgConfig {
  // Location
  location: {
    lat: number;
    lon: number;
    timezone: string;
    city: string;
  };

  // Food cost thresholds
  foodCostThresholds: {
    excellent: number; // ≤ this = green (default 25)
    acceptable: number; // ≤ this = yellow, > this = red (default 35)
  };

  // Stations / categories
  stations: string[];

  // Academic calendar (optional, for weather-aware analytics)
  academicCalendar: {
    enabled: boolean;
    q1ClassesStart: string; // "MM-DD" e.g. "09-08"
    q1ClassesEnd: string;   // "12-20"
    q1ExamsStart: string;   // "01-12"
    q1ExamsEnd: string;     // "01-31"
    q2ClassesStart: string; // "02-03"
    q2ClassesEnd: string;   // "05-22"
    q2ExamsStart: string;   // "06-01"
    q2ExamsEnd: string;     // "06-20"
    holidays: string[];     // ["2026-01-01", "2026-01-06", ...]
  };

  // Currency
  currency: string; // "EUR", "USD", etc.

  // Language
  language: string; // "es", "en"
}

const DEFAULT_CONFIG: OrgConfig = {
  location: {
    lat: 40.4168,
    lon: -3.7038,
    timezone: "Europe/Madrid",
    city: "Madrid",
  },
  foodCostThresholds: {
    excellent: 25,
    acceptable: 35,
  },
  stations: ["espresso", "cold", "food", "entrega"],
  academicCalendar: {
    enabled: false,
    q1ClassesStart: "09-08",
    q1ClassesEnd: "12-20",
    q1ExamsStart: "01-12",
    q1ExamsEnd: "01-31",
    q2ClassesStart: "02-03",
    q2ClassesEnd: "05-22",
    q2ExamsStart: "06-01",
    q2ExamsEnd: "06-20",
    holidays: [],
  },
  currency: "EUR",
  language: "es",
};

function mergeConfig(saved: Partial<OrgConfig>): OrgConfig {
  return {
    location: { ...DEFAULT_CONFIG.location, ...(saved.location || {}) },
    foodCostThresholds: { ...DEFAULT_CONFIG.foodCostThresholds, ...(saved.foodCostThresholds || {}) },
    stations: saved.stations || DEFAULT_CONFIG.stations,
    academicCalendar: { ...DEFAULT_CONFIG.academicCalendar, ...(saved.academicCalendar || {}) },
    currency: saved.currency || DEFAULT_CONFIG.currency,
    language: saved.language || DEFAULT_CONFIG.language,
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db.collection("orgs").doc(orgId).collection("settings").doc("config").get();
    const saved = snap.exists ? (snap.data() as Partial<OrgConfig>) : {};
    const config = mergeConfig(saved);

    return NextResponse.json({ config });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const updates = await req.json();

    // Only allow known fields
    const allowed = ["location", "foodCostThresholds", "stations", "academicCalendar", "currency", "language"];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.collection("orgs").doc(orgId).collection("settings").doc("config").set(filtered, { merge: true });

    // Return merged config
    const snap = await db.collection("orgs").doc(orgId).collection("settings").doc("config").get();
    const saved = snap.exists ? (snap.data() as Partial<OrgConfig>) : {};
    const config = mergeConfig(saved);

    return NextResponse.json({ ok: true, config });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
