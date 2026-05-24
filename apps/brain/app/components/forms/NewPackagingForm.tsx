"use client";

import { useState } from "react";
import { T, modalTitle, input, btnPrimary, btnSmall, btnGhost, fmt } from "../theme";
import { Fld } from "../ui";

export default function NewPackagingForm({ onSave, saving, onClose }: { onSave: (d: { name: string; items: Array<{ name: string; unitCost: number; qty: number }> }) => void; saving: boolean; onClose?: () => void }) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<Array<{ name: string; unitCost: number; qty: number }>>([{ name: "", unitCost: 0, qty: 1 }]);

  const total = items.reduce((s, i) => s + i.unitCost * i.qty, 0);

  const addRow = () => setItems([...items, { name: "", unitCost: 0, qty: 1 }]);

  const upd = (idx: number, f: string, v: unknown) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [f]: v } : it)));
  };

  return (
    <div>
      <h2 style={modalTitle}>Nuevo Packaging</h2>
      <fieldset disabled={saving} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: saving ? 0.6 : 1 }}>
          <Fld label="Nombre">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Vaso 12oz + tapa + manga" style={{ ...input, width: "100%" }} autoFocus />
          </Fld>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Componentes</div>
            <div style={{ background: T.bg, borderRadius: 10, padding: 12 }}>
              {/* Header row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span style={{ flex: 1 }}>Nombre</span>
                <span style={{ width: 80, textAlign: "right" }}>€/ud</span>
                <span style={{ width: 50, textAlign: "right" }}>Qty</span>
                <span style={{ width: 60, textAlign: "right" }}>Subtotal</span>
                <span style={{ width: 28 }} />
              </div>
              {items.map((it, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <input value={it.name} onChange={e => upd(i, "name", e.target.value)} placeholder="Vaso papel 12oz" style={{ ...input, flex: 1, fontSize: 13, padding: "8px 12px" }} />
                  <input type="number" step="0.001" value={it.unitCost} onChange={e => upd(i, "unitCost", Number(e.target.value))} placeholder="€/ud" style={{ ...input, width: 80, fontFamily: T.mono, fontSize: 13, padding: "8px 10px" }} />
                  <input type="number" value={it.qty} onChange={e => upd(i, "qty", Number(e.target.value))} style={{ ...input, width: 50, fontFamily: T.mono, fontSize: 13, padding: "8px 10px" }} />
                  <span style={{ width: 60, textAlign: "right", fontFamily: T.mono, fontSize: 12, color: T.muted }}>{fmt(it.unitCost * it.qty)}€</span>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ ...btnGhost, padding: 4, fontSize: 12, width: 28 }}>✕</button>
                </div>
              ))}
              <button onClick={addRow} style={{ ...btnSmall, marginTop: 4, fontSize: 12 }}>+ Componente</button>
            </div>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.accent, textAlign: "right", padding: "4px 0" }}>
            Total: {fmt(total)}€
          </div>
        </div>
      </fieldset>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button onClick={() => onClose?.()} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave({ name: name.trim(), items: items.filter(i => i.name.trim()) })} disabled={!name.trim() || saving} style={{ ...btnPrimary, opacity: !name.trim() || saving ? 0.4 : 1 }}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
