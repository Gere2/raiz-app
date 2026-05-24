"use client";

import { fontFamily } from "./styles";

export default function SideBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        background: active ? "#1e1e1e" : "transparent",
        color: active ? "#e8e8e8" : "#888",
        fontFamily,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
