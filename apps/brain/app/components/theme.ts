import type React from "react";

/* ─── Design Tokens (REFINED LIGHT THEME) ───────────────────── */
export const T = {
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', Menlo, monospace",
  /* Backgrounds */
  bg: "#f5f5f4",           // warm stone-100
  surface: "#ffffff",
  cardBg: "#ffffff",
  surfaceHover: "#fafaf9",  // stone-50
  /* Borders */
  border: "#e7e5e4",        // stone-200
  borderLight: "#f5f5f4",   // stone-100
  /* Text */
  text: "#1c1917",          // stone-900
  muted: "#57534e",         // stone-600
  dim: "#a8a29e",           // stone-400
  /* Brand */
  accent: "#92400e",        // amber-800 — warm coffee
  accentLight: "#fef3c7",   // amber-100
  accentMid: "#d97706",     // amber-600
  /* Semantic */
  success: "#15803d",       // green-700
  successBg: "#f0fdf4",
  warning: "#a16207",       // yellow-700
  warningBg: "#fefce8",
  danger: "#b91c1c",        // red-700
  dangerBg: "#fef2f2",
  info: "#1d4ed8",          // blue-700
  infoBg: "#eff6ff",
  /* Sidebar */
  sidebarBg: "#1c1917",     // stone-900
  sidebarText: "#d6d3d1",   // stone-300
  sidebarTextActive: "#ffffff",
  sidebarAccent: "#d97706", // amber-600
  sidebarHover: "#292524",  // stone-800
  sidebarDim: "#78716c",    // stone-500
  sidebarBorder: "#292524",
};

/* ─── Shared Styles ──────────────────────────────────────────── */
export const page: React.CSSProperties = { padding: "32px 40px", maxWidth: 1120 };
export const pageTitle: React.CSSProperties = { fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 4px", color: T.text, lineHeight: 1.2 };
export const pageSub: React.CSSProperties = { color: T.muted, fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 };

export const modalTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: "0 0 20px", color: T.text, letterSpacing: "-0.02em" };

/* Tables */
export const tableWrap: React.CSSProperties = { background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" };
export const tableHead: React.CSSProperties = { padding: "14px 20px", borderBottom: `1px solid ${T.border}` };
export const tableRow: React.CSSProperties = { padding: "12px 20px", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" };
export const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
export const trHead: React.CSSProperties = { borderBottom: `2px solid ${T.border}` };
export const trBody: React.CSSProperties = { borderBottom: `1px solid ${T.borderLight}`, transition: "background 0.15s" };
export const th: React.CSSProperties = { padding: "12px 20px", fontSize: 11, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em" };
export const td: React.CSSProperties = { padding: "14px 20px", fontSize: 14 };
export const tdR: React.CSSProperties = { padding: "14px 20px", textAlign: "right", fontFamily: T.mono, fontSize: 13 };

/* Badges */
export const badge: React.CSSProperties = { fontFamily: T.mono, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, display: "inline-block" };

/* KPI */
export const kpiBox: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" };
export const kpiLbl: React.CSSProperties = { fontSize: 11, color: T.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 };
export const kpiVal: React.CSSProperties = { fontFamily: T.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" };

/* Inputs */
export const input: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" };

/* Buttons */
export const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s, transform 0.1s", letterSpacing: "-0.01em" };
export const btnSmall: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.muted, fontFamily: T.font, fontSize: 13, cursor: "pointer", transition: "all 0.15s", fontWeight: 500 };
export const btnGhost: React.CSSProperties = { padding: 8, borderRadius: 8, border: "none", background: "transparent", color: T.dim, cursor: "pointer", fontSize: 14, fontFamily: T.font, transition: "color 0.15s, background 0.15s" };

/* ─── Helpers ── */
export const fmt = (n: number) => (n ?? 0).toFixed(2);
export const fmt4 = (n: number) => (n ?? 0).toFixed(4);
export const stationEmoji: Record<string, string> = { espresso: "☕", cold: "🧊", food: "🍳", entrega: "📦", "": "—" };
