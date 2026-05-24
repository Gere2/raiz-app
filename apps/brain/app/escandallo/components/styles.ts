/**
 * escandallo/components/styles.ts
 * Shared style constants for the Escandallo module.
 */

export const fontFamily = "'system-ui', '-apple-system', sans-serif";
export const mono = "'SF Mono', 'Menlo', monospace";

export const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: "#c8a97e",
  color: "#0c0c0c",
  fontFamily,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnSmall: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #333",
  background: "transparent",
  color: "#888",
  fontFamily,
  fontSize: 12,
  cursor: "pointer",
};

export const btnIcon: React.CSSProperties = {
  padding: 6,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "#555",
  cursor: "pointer",
  fontSize: 14,
};

export const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #333",
  background: "#0c0c0c",
  color: "#e8e8e8",
  fontFamily,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

export const tableWrap: React.CSSProperties = {
  background: "#161616",
  borderRadius: 12,
  border: "1px solid #2a2a2a",
  overflow: "hidden",
};

export const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 10,
  fontWeight: 500,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

export const tdRight: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "right",
  fontFamily: mono,
  fontSize: 13,
};

export const kpiCardStyle: React.CSSProperties = {
  background: "#161616",
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: "14px 16px",
};

export const kpiLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#555",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 500,
};

export const kpiValueStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

export const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  fontWeight: 500,
  display: "block",
};
