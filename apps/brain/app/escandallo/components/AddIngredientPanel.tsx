"use client";

import { useState } from "react";
import type { CatalogItem } from "./types";
import { inputStyle, btnPrimary, btnSmall, fieldLabel, fontFamily, mono } from "./styles";
import { fmt4, fmt } from "../../components/theme";

export default function AddIngredientPanel({
  catalog,
  onAdd,
  onClose,
  saving,
}: {
  catalog: CatalogItem[];
  onAdd: (catalogItemId: string, qty: number, unit: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [qty, setQty] = useState("");

  const filtered = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.supplier.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      style={{
        background: "#161616",
        borderRadius: 12,
        border: "1px solid rgba(200,169,126,0.25)",
        padding: 20,
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#c8a97e" }}>
          A\u00f1adir ingrediente del cat\u00e1logo
        </span>
        <button onClick={onClose} style={btnSmall}>
          Cerrar
        </button>
      </div>

      {!selected ? (
        <>
          <input
            placeholder="Buscar en cat\u00e1logo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginBottom: 12 }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #222",
                  color: "#e8e8e8",
                  cursor: "pointer",
                  fontFamily,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {c.supplier} \u00b7 {fmt4(c.unitCost)}\u20ac/{c.baseUnit}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#555",
                }}
              >
                Sin resultados
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
              {selected.name}
            </div>
            <div style={{ fontSize: 11, color: "#555" }}>
              {fmt4(selected.unitCost)}\u20ac/{selected.baseUnit}
            </div>
          </div>
          <label style={fieldLabel}>
            Cantidad ({selected.baseUnit})
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="200"
              style={{
                ...inputStyle,
                width: 90,
                marginTop: 4,
                fontFamily: mono,
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && qty && Number(qty) > 0) {
                  onAdd(selected.id, Number(qty), selected.baseUnit);
                }
              }}
            />
          </label>
          {qty && Number(qty) > 0 && (
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                color: "#c8a97e",
                whiteSpace: "nowrap",
              }}
            >
              = {fmt(Number(qty) * selected.unitCost)}\u20ac
            </div>
          )}
          <button
            onClick={() =>
              qty &&
              Number(qty) > 0 &&
              onAdd(selected.id, Number(qty), selected.baseUnit)
            }
            disabled={!qty || Number(qty) <= 0 || saving}
            style={{
              ...btnPrimary,
              opacity: !qty || Number(qty) <= 0 || saving ? 0.4 : 1,
              fontSize: 13,
              padding: "8px 14px",
            }}
          >
            {saving ? "..." : "A\u00f1adir"}
          </button>
          <button
            onClick={() => {
              setSelected(null);
              setQty("");
            }}
            style={btnSmall}
          >
            Cambiar
          </button>
        </div>
      )}
    </div>
  );
}
