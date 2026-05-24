"use client";

import { useState } from "react";
import { inputStyle, btnPrimary, fieldLabel, mono } from "./styles";

export default function NewRecipeForm({
  onSave,
  saving,
}: {
  onSave: (n: string, yq: number, yu: string, sp: number) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [yieldQty, setYieldQty] = useState(1);
  const [yieldUnit, setYieldUnit] = useState("taza");
  const [price, setPrice] = useState(0);

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>
        Nueva receta
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={fieldLabel}>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Caf\u00e9 Latte"
            style={{ ...inputStyle, width: "100%", marginTop: 4 }}
            autoFocus
          />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={fieldLabel}>
            Rendimiento
            <input
              type="number"
              value={yieldQty}
              onChange={(e) => setYieldQty(Number(e.target.value))}
              style={{ ...inputStyle, width: 80, marginTop: 4 }}
            />
          </label>
          <label style={fieldLabel}>
            Unidad
            <select
              value={yieldUnit}
              onChange={(e) => setYieldUnit(e.target.value)}
              style={{ ...inputStyle, width: 110, marginTop: 4 }}
            >
              {["taza", "unidad", "raci\u00f3n", "litro"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            PVP (\u20ac)
            <input
              type="number"
              step="0.1"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              style={{
                ...inputStyle,
                width: 90,
                marginTop: 4,
                fontFamily: mono,
              }}
            />
          </label>
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
            name.trim() && onSave(name.trim(), yieldQty, yieldUnit, price)
          }
          disabled={!name.trim() || saving}
          style={{
            ...btnPrimary,
            opacity: !name.trim() || saving ? 0.4 : 1,
          }}
        >
          {saving ? "Guardando..." : "Crear receta"}
        </button>
      </div>
    </div>
  );
}
