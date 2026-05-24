"use client";

import { useState } from "react";
import { T, modalTitle, input, btnPrimary } from "../theme";
import { Fld } from "../ui";

export default function NewSupplierForm({ onSave, saving, onClose }: { onSave: (d: { name: string; contact: string; phone: string; email: string; notes: string }) => void; saving: boolean; onClose?: () => void }) {
  const [n, setN] = useState("");
  const [c, setC] = useState("");
  const [p, setP] = useState("");
  const [e, setE] = useState("");
  const [no, setNo] = useState("");

  return (
    <div>
      <h2 style={modalTitle}>Nuevo proveedor</h2>
      <fieldset disabled={saving} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: saving ? 0.6 : 1 }}>
          <Fld label="Nombre">
            <input value={n} onChange={ev => setN(ev.target.value)} placeholder="Makro, Amor Perfecto..." style={{ ...input, width: "100%" }} autoFocus />
          </Fld>
          <div style={{ display: "flex", gap: 12 }}>
            <Fld label="Contacto">
              <input value={c} onChange={ev => setC(ev.target.value)} placeholder="Nombre del contacto" style={{ ...input, flex: 1, minWidth: 120 }} />
            </Fld>
            <Fld label="Teléfono">
              <input value={p} onChange={ev => setP(ev.target.value)} placeholder="+34 600 000 000" style={{ ...input, width: 150 }} />
            </Fld>
          </div>
          <Fld label="Email">
            <input value={e} onChange={ev => setE(ev.target.value)} placeholder="proveedor@ejemplo.com" style={{ ...input, width: "100%" }} type="email" />
          </Fld>
          <Fld label="Notas">
            <textarea value={no} onChange={ev => setNo(ev.target.value)} placeholder="Horarios de entrega, condiciones..." rows={3} style={{ ...input, width: "100%", resize: "vertical", lineHeight: 1.5 }} />
          </Fld>
        </div>
      </fieldset>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button onClick={() => onClose?.()} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>Cancelar</button>
        <button onClick={() => n.trim() && onSave({ name: n.trim(), contact: c, phone: p, email: e, notes: no })} disabled={!n.trim() || saving} style={{ ...btnPrimary, opacity: !n.trim() || saving ? 0.4 : 1 }}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
