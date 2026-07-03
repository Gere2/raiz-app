"use client";

/**
 * CommunityNav — acceso global persistente a la comunidad Enverde.
 *
 * Pastilla flotante (abajo-derecha) con enlace a /comunidad y campana con el
 * contador de respuestas nuevas a tus hilos. Se monta en el root layout, pero
 * solo se pinta cuando:
 *   - la marca del host es Enverde (no Raíz), y
 *   - estamos en una página de café (/org/[orgId]/…), de donde sacamos el orgId.
 * En la propia /comunidad no se pinta (sería redundante).
 *
 * Self-contained: auth propia (onAuthStateChanged) + fetch del contador. Si algo
 * falla, no estorba (degrada a solo el enlace, o no se pinta).
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authed-fetch";
import { useBrand } from "./brand-context";

const ACCENT = "var(--t-accent)";
const ON_ACCENT = "var(--t-on-accent)";

export default function CommunityNav() {
  const brand = useBrand();
  const pathname = usePathname() || "";
  const orgId = useMemo(() => pathname.match(/\/org\/([^/]+)/)?.[1] ?? null, [pathname]);

  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);

  const enabled = brand.key === "enverde" && !!orgId && !pathname.includes("/comunidad");

  useEffect(() => {
    if (!enabled) return;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user) return;
    let active = true;
    authedFetch(user, `/api/community/notifications`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setUnread(d.unread ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, user]);

  if (!enabled) return null;

  return (
    <a
      href={`/org/${orgId}/comunidad`}
      aria-label={unread > 0 ? `Comunidad, ${unread} respuestas nuevas` : "Comunidad Enverde"}
      style={{
        position: "fixed",
        right: "clamp(16px, 4vw, 28px)",
        bottom: "clamp(16px, 4vw, 28px)",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 18px",
        borderRadius: 999,
        background: ACCENT,
        color: ON_ACCENT,
        textDecoration: "none",
        fontWeight: 700,
        fontSize: 14,
        boxShadow: "0 10px 30px -8px rgba(0,0,0,0.45)",
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
        🌱
      </span>
      Comunidad
      {unread > 0 && (
        <span
          aria-hidden
          style={{
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 999,
            background: ON_ACCENT,
            color: ACCENT,
            fontSize: 12,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </a>
  );
}
