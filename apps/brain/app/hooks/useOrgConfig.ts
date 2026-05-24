"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../lib/authed-fetch";

export interface OrgConfig {
  location: {
    lat: number;
    lon: number;
    timezone: string;
    city: string;
  };
  foodCostThresholds: {
    excellent: number;
    acceptable: number;
  };
  stations: string[];
  academicCalendar: {
    enabled: boolean;
    q1ClassesStart: string;
    q1ClassesEnd: string;
    q1ExamsStart: string;
    q1ExamsEnd: string;
    q2ClassesStart: string;
    q2ClassesEnd: string;
    q2ExamsStart: string;
    q2ExamsEnd: string;
    holidays: string[];
  };
  currency: string;
  language: string;
}

const DEFAULT_CONFIG: OrgConfig = {
  location: { lat: 40.4168, lon: -3.7038, timezone: "Europe/Madrid", city: "Madrid" },
  foodCostThresholds: { excellent: 25, acceptable: 35 },
  stations: ["espresso", "cold", "food", "entrega"],
  academicCalendar: {
    enabled: false,
    q1ClassesStart: "09-08", q1ClassesEnd: "12-20",
    q1ExamsStart: "01-12", q1ExamsEnd: "01-31",
    q2ClassesStart: "02-03", q2ClassesEnd: "05-22",
    q2ExamsStart: "06-01", q2ExamsEnd: "06-20",
    holidays: [],
  },
  currency: "EUR",
  language: "es",
};

export function useOrgConfig(user: User | null, orgId: string) {
  const [config, setConfig] = useState<OrgConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!user || !orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/config`);
      if (r.ok) {
        const d = await r.json();
        setConfig(d.config);
      }
    } catch (e) {
      console.error("Failed to load org config:", e);
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, [user, orgId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const updateConfig = useCallback(async (updates: Partial<OrgConfig>) => {
    if (!user || !orgId) return;
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (r.ok) {
        const d = await r.json();
        setConfig(d.config);
      }
    } catch (e) {
      console.error("Failed to update org config:", e);
    }
  }, [user, orgId]);

  // Helper functions that use thresholds from config
  const fcColor = useCallback((p: number) => {
    const { excellent, acceptable } = config.foodCostThresholds;
    return p <= excellent ? "#16a34a" : p <= acceptable ? "#ca8a04" : "#dc2626";
  }, [config.foodCostThresholds]);

  const fcBg = useCallback((p: number) => {
    const { excellent, acceptable } = config.foodCostThresholds;
    return p <= excellent ? "#f0fdf4" : p <= acceptable ? "#fefce8" : "#fef2f2";
  }, [config.foodCostThresholds]);

  const fcLabel = useCallback((p: number) => {
    const { excellent, acceptable } = config.foodCostThresholds;
    return p <= excellent ? "Excelente" : p <= acceptable ? "Aceptable" : "Alto";
  }, [config.foodCostThresholds]);

  return {
    config,
    loading,
    updateConfig,
    refetch: fetchConfig,
    fcColor,
    fcBg,
    fcLabel,
  };
}
