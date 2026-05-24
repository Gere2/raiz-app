"use client";

import { useState } from "react";
import { T, modalTitle, input, btnPrimary, fmt } from "../theme";
import { Fld } from "../ui";

export default function NewRecipeForm({ onSave, saving, onClose }: { onSave: (n: string, yq: number, yu: string, sp: number) => void; saving: boolean; onClose?: () => void }) {
  const [n, setN] = useState("");
  const [yq, setYq] = useState(1);
  const [yu, setYu] = useState("taza");
  const [p, setP] = useState(0);

  return (
    <div>
      <h2 style={modalTitle}>Nueva receta</h2>
      <fieldset disabled={saving} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: saving ? 0.6 : 1 }}>
          <Fld label="Nombre">
            <input
              value={n}
              onChange={e => setN(e.target.value)}
              placeholder="Café Latte"
              style={{ ...input, width: "100%" }}
              autoFocus
            />
          </Fld>
          <div style={{ display: "flex", gap: 12 }}>
            <Fld label="Rendimiento">
              <input
                type="number"
                value={yq}
                onChange={e => setYq(Number(e.target.value))}
                style={{ ...input, width: 70 }}
              />
            </Fld>
            <Fld label="Unidad">
              <select
                value={yu}
                onChange={e => setYu(e.target.value)}
                style={{ ...input, width: 100 }}
              >
                {["taza", "unidad", "ración", "litro"].map(u => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Fld>
            <Fld label="PVP (€)">
              <input
                type="number"
                step="0.1"
                value={p}
                onChange={e => setP(Number(e.target.value))}
                style={{ ...input, width: 80, fontFamily: T.mono }}
              />
            </Fld>
          </div>
        </div>
      </fieldset>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button
          onClick={() => onClose?.()}
          style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          Cancelar
        </button>
        <button
          onClick={() => n.trim() && onSave(n.trim(), yq, yu, p)}
          disabled={!n.trim() || saving}
          style={{ ...btnPrimary, opacity: !n.trim() || saving ? 0.4 : 1 }}
        >
          {saving ? "⏳ Guardando..." : "Crear"}
        </button>
      </div>
    </div>
  );
}
