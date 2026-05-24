"use client";

import { useState } from "react";
import { inputStyle, btnPrimary, fieldLabel, mono } from "./styles";
import { fmt4 } from "../../components/theme";

export default function NewCatalogForm({
  onSave,
  saving,
}: {
  onSave: (item: {
    name: string;
    baseUnit: string;
    packQty: number;
    packUnit: string;
    packCost: number;
    supplier: string;
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [baseUnit, setBaseUnit] = useState("g");
  const [packQty, setPackQty] = useState(1000);
  const [packUnit, setPackUnit] = useState("kg");
  const [packCost, setPackCost] = useState(0);
  const [supplier, setSupplier] = useState("");

  const unitCost = packQty > 0 ? packCost / packQty : 0;

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>
        Nuevo art\u00edculo de cat\u00e1logo
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={fieldLabel}>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leche entera"
            style={{ ...inputStyle, width: "100%", marginTop: 4 }}
            autoFocus
          />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={fieldLabel}>
            Unidad base
            <select
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value)}
              style={{ ...inputStyle, width: 80, marginTop: 4 }}
            >
              {["g", "ml", "ud", "kg", "L"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            Uds/pack
            <input
              type="number"
              value={packQty}
              onChange={(e) => setPackQty(Number(e.target.value))}
              style={{
                ...inputStyle,
                width: 90,
                marginTop: 4,
                fontFamily: mono,
              }}
            />
          </label>
          <label style={fieldLabel}>
            Nombre pack
            <input
              value={packUnit}
              onChange={(e) => setPackUnit(e.target.value)}
              style={{ ...inputStyle, width: 100, marginTop: 4 }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <label style={fieldLabel}>
            \u20ac/pack
            <input
              type="number"
              step="0.01"
              value={packCost}
              onChange={(e) => setPackCost(Number(e.target.value))}
              style={{
                ...inputStyle,
                width: 90,
                marginTop: 4,
                fontFamily: mono,
              }}
            />
          </label>
          <label style={fieldLabel}>
            Proveedor
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Makro"
              style={{ ...inputStyle, width: 130, marginTop: 4 }}
            />
          </label>
          <div
            style={{
              padding: "8px 12px",
              background: "#1a1a1a",
              borderRadius: 8,
              fontFamily: mono,
              fontSize: 13,
              color: "#c8a97e",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            = {fmt4(unitCost)}\u20ac/{baseUnit}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 24,
        }}
      >
        <button
          onClick={() =>
            name.trim() &&
            onSave({ name: name.trim(), baseUnit, packQty, packUnit, packCost, supplier })
          }
          disabled={!name.trim() || saving}
          style={{
            ...btnPrimary,
            opacity: !name.trim() || saving ? 0.4 : 1,
          }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
