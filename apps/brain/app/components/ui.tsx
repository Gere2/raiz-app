"use client";

import { useState } from "react";
import { T, kpiBox, kpiLbl, kpiVal, tableWrap, tableHead, btnGhost, btnSmall, input } from "./theme";

/* ─── Shell ── */
export function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: T.font, background: T.bg, color: T.text, minHeight: "100vh", display: "flex" }}>{children}</div>;
}

/* ─── NavBtn (dark sidebar) ── */
export function NavBtn({ label, icon, active, onClick, badge: b, open }: {
  label: string; icon: string; active: boolean; onClick: () => void; badge?: string; open: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
      padding: open ? "9px 14px" : "9px 12px", borderRadius: 10, border: "none",
      background: active ? T.sidebarHover : "transparent",
      color: active ? T.sidebarTextActive : T.sidebarText,
      fontFamily: T.font, fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
      borderLeft: active ? `3px solid ${T.sidebarAccent}` : "3px solid transparent",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: open ? 15 : 17, lineHeight: 1, width: 20, textAlign: "center", opacity: active ? 1 : 0.7 }}>{icon}</span>
        {open && <span>{label}</span>}
      </span>
      {b && open && <span style={{ fontSize: 10, color: T.sidebarDim, background: T.sidebarHover, padding: "2px 8px", borderRadius: 6, fontFamily: T.mono, fontWeight: 600 }}>{b}</span>}
    </button>
  );
}

/* ─── NavGroup (section label) ── */
export function NavGroup({ label, open }: { label: string; open: boolean }) {
  if (!open) return <div style={{ height: 16 }} />;
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: T.sidebarDim, textTransform: "uppercase",
      letterSpacing: "0.1em", padding: "16px 14px 6px",
    }}>
      {label}
    </div>
  );
}

/* ─── Kpi ── */
export function Kpi({ label, value, color, sub, badge: b, badgeBg }: {
  label: string; value: string; color?: string; sub?: string; badge?: string; badgeBg?: string;
}) {
  return (
    <div style={kpiBox}>
      <div style={kpiLbl}>{label}</div>
      <div style={{ ...kpiVal, color: color || T.text }}>
        {value}
        {b && <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 8, padding: "3px 8px", borderRadius: 6, background: badgeBg || T.bg }}>{b}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─── ActionCard ── */
export function ActionCard({ title, desc, count, accent, onClick }: {
  title: string; desc: string; count: number; accent: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 20, textAlign: "left", cursor: "pointer", fontFamily: T.font, width: "100%",
      transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</span>
        <span style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: accent }}>{count}</span>
      </div>
      <p style={{ fontSize: 13, color: T.muted, margin: "8px 0 0", lineHeight: 1.5 }}>{desc}</p>
    </button>
  );
}

/* ─── FilterTab ── */
export function FilterTab({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string;
}) {
  const c = color || T.accent;
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 8, border: `1px solid ${active ? c : T.border}`,
      background: active ? c + "14" : T.surface, color: active ? c : T.muted,
      fontFamily: T.font, fontSize: 13, cursor: "pointer", fontWeight: active ? 600 : 400,
      transition: "all 0.15s",
    }}>
      {label} <span style={{ opacity: 0.5, marginLeft: 2 }}>{count}</span>
    </button>
  );
}

/* ─── Overlay (Modal) ── */
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{
        position: "relative",
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20,
        padding: "32px 32px 28px", minWidth: 440, maxWidth: 560, maxHeight: "85vh", overflow: "auto",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)",
        animation: "modalIn 0.15s ease-out",
      }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          width: 28, height: 28, borderRadius: 8,
          border: "none", background: "transparent", color: T.dim,
          fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "color 0.15s, background 0.15s",
        }} aria-label="Cerrar">✕</button>
        {children}
        <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
      </div>
    </div>
  );
}

/* ─── Fld (Form field) ── */
export function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ fontSize: 12, color: T.muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</label>{children}</div>;
}

/* ─── EditableList ── */
export function EditableList({ title, items, onSave, placeholder }: {
  title: string; items: string[]; onSave: (i: string[]) => void; placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  return (
    <div style={tableWrap}>
      <div style={{ ...tableHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <button onClick={() => setEditing(!editing)} style={{ ...btnGhost, fontSize: 12, fontWeight: 500 }}>{editing ? "Listo" : "Editar"}</button>
      </div>
      <div style={{ padding: 16 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
            <span>{item}</span>
            {editing && <button onClick={() => onSave(items.filter((_, j) => j !== i))} style={btnGhost}>✕</button>}
          </div>
        ))}
        {items.length === 0 && !editing && <p style={{ color: T.dim, fontSize: 13 }}>Ninguno</p>}
        {editing && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} style={{ ...input, flex: 1, fontSize: 13 }}
              onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onSave([...items, val.trim()]); setVal(""); } }} />
            <button onClick={() => { if (val.trim()) { onSave([...items, val.trim()]); setVal(""); } }} style={btnSmall}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ErrorBanner (reusable) ── */
export function ErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div style={{
      background: T.dangerBg, borderBottom: `1px solid #fecaca`,
      padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 14, color: T.danger,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        {message}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {onRetry && <button onClick={onRetry} style={{ ...btnGhost, color: T.danger, fontSize: 13, fontWeight: 600 }}>Reintentar</button>}
        {onDismiss && <button onClick={onDismiss} style={{ ...btnGhost, fontSize: 16 }}>✕</button>}
      </div>
    </div>
  );
}
