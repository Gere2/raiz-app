"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "../../lib/authed-fetch";

export type Org = {
  id: string;
  name: string;
};

/**
 * SECURITY NOTE: localStorage is used ONLY for UI state (org selection preference).
 * It does NOT store credentials, tokens, or sensitive data.
 * All authentication is handled server-side with secure Bearer tokens.
 */
const STORAGE_KEY = "brain-selected-org";

export function useOrg(user: User | null) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgIdState] = useState<string>("");
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  useEffect(() => {
    if (!user) { setOrgs([]); setOrgIdState(""); setLoadingOrgs(false); return; }
    let cancelled = false;

    (async () => {
      setLoadingOrgs(true);
      try {
        const r = await authedFetch(user, "/api/my-orgs");
        const d = await r.json();
        if (cancelled) return;
        const list: Org[] = d.orgs || [];
        setOrgs(list);

        // Restore saved org or default to first
        const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
        if (saved && list.some(o => o.id === saved)) {
          setOrgIdState(saved);
        } else if (list.length > 0) {
          setOrgIdState(list[0].id);
        }
      } catch (e) {
        console.error("Failed to fetch orgs:", e);
        // No hardcoded fallback — orgs come from Firebase only
        setOrgs([]);
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return { orgs, orgId, setOrgId, loadingOrgs };
}
