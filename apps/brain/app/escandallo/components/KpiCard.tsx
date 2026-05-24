"use client";

import { kpiCardStyle, kpiLabelStyle, kpiValueStyle } from "./styles";

export default function KpiCard({
  label,
  value,
  color,
  badge,
  badgeBg,
}: {
  label: string;
  value: string;
  color?: string;
  badge?: string;
  badgeBg?: string;
}) {
  return (
    <div style={kpiCardStyle}>
      <div style={kpiLabelStyle}>{label}</div>
      <div style={{ ...kpiValueStyle, color: color || "#e8e8e8" }}>
        {value}
        {badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              marginLeft: 6,
              padding: "2px 6px",
              borderRadius: 4,
              background: badgeBg || "#1a1a1a",
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
