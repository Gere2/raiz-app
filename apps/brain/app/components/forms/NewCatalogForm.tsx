"use client";

import { useState } from "react";
import { T, modalTitle, input, btnPrimary, fmt4 } from "../theme";
import { Fld } from "../ui";

export default function NewCatalogForm({ onSave, saving, onClose }: { onSave: (i: { name: string; baseUnit: string; packQty: number; packUnit: string; packCost: number; supplier: string }) => void; saving: boolean; onClose?: () => void }) {
  const [n, setN] = useState("");
  const [bu, setBu] = useState("g");
  const [pq, setPq] = useState(1000);
  const [pu, setPu] = useState("kg");
  const [pc, setPc] = useState(0);
  const [su, setSu] = useState("");

  const uc = pq > 0 ? pc / pq : 0;

  return (
    <div>
      <h2 style={modalTitle}>Nuevo artículo</h2>
      <fieldset disabled={saving} style={{ border: "none", padding: 0, margin: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: saving ? 0.6 : 1 }}>
        <Fld label="Nombre">
          <input
            value={n}
            onChange={e => setN(e.target.value)}
            placeholder="Leche entera"
            style={{ ...input, width: "100%" }}
            autoFocus
          />
        </Fld>
        <div style={{ display: "flex", gap: 12 }}>
          <Fld label="Unidad base">
            <select
              value={bu}
              onChange={e => setBu(e.target.value)}
              style={{ ...input, width: 70 }}
            >
              {["g", "ml", "ud", "kg", "L"].map(u => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Fld>
          <Fld label="Uds/pack">
            <input
              type="number"
              value={pq}
              onChange={e => setPq(Number(e.target.value))}
              style={{ ...input, width: 80, fontFamily: T.mono }}
            />
          </Fld>
          <Fld label="Pack">
            <input
              value={pu}
              onChange={e => setPu(e.target.value)}
              style={{ ...input, width: 80 }}
            />
          </Fld>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <Fld label="€/pack">
            <input
              type="number"
              step="0.01"
              value={pc}
              onChange={e => setPc(Number(e.target.value))}
              style={{ ...input, width: 80, fontFamily: T.mono }}
            />
          </Fld>
          <Fld label="Proveedor">
            <input
              value={su}
              onChange={e => setSu(e.target.value)}
              placeholder="Makro"
              style={{ ...input, width: 110 }}
            />
          </Fld>
          <div style={{ padding: "8px 12px", background: T.bg, borderRadius: 8, fontFamily: T.mono, fontSize: 13, color: T.accent, fontWeight: 600 }}>
            = {fmt4(uc)}€/{bu}
          </div>
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
          onClick={() => n.trim() && onSave({ name: n.trim(), baseUnit: bu, packQty: pq, packUnit: pu, packCost: pc, supplier: su })}
          disabled={!n.trim() || saving}
          style={{ ...btnPrimary, opacity: !n.trim() || saving ? 0.4 : 1 }}
        >
          {saving ? "..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
