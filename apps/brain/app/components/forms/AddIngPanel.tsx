"use client";

import { useState } from "react";
import { T, input, btnSmall, btnPrimary, fmt, fmt4 } from "../theme";
import { Fld } from "../ui";

type CatalogItem = { id: string; name: string; baseUnit: string; packQty: number; packUnit: string; packCost: number; unitCost: number; supplier: string };

export default function AddIngPanel({ catalog, onAdd, onClose, saving }: { catalog: CatalogItem[]; onAdd: (c: string, q: number, u: string) => void; onClose: () => void; saving: boolean }) {
  const [s, setS] = useState("");
  const [sel, setSel] = useState<CatalogItem | null>(null);
  const [q, setQ] = useState("");

  const f = catalog.filter(c => c.name.toLowerCase().includes(s.toLowerCase()) || c.supplier.toLowerCase().includes(s.toLowerCase()));

  return (
    <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.accent}40`, padding: 18, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>Añadir ingrediente</span>
        <button onClick={onClose} style={btnSmall}>
          Cerrar
        </button>
      </div>
      {!sel ? (
        <>
          <input
            placeholder="Buscar materia prima..."
            value={s}
            onChange={e => setS(e.target.value)}
            style={{ ...input, width: "100%", marginBottom: 10 }}
            autoFocus
          />
          <div style={{ maxHeight: 180, overflow: "auto" }}>
            {f.map(c => (
              <button
                key={c.id}
                onClick={() => setSel(c)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${T.border}`,
                  color: T.text,
                  cursor: "pointer",
                  fontFamily: T.font,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: T.dim }}>
                  {c.supplier} · {fmt4(c.unitCost)}€/{c.baseUnit}
                </div>
              </button>
            ))}
            {f.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: T.dim }}>Sin resultados</div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.muted }}>{sel.name}</div>
            <div style={{ fontSize: 11, color: T.dim }}>
              {fmt4(sel.unitCost)}€/{sel.baseUnit}
            </div>
          </div>
          <Fld label={sel.baseUnit}>
            <input
              type="number"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="200"
              style={{ ...input, width: 80, fontFamily: T.mono }}
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter" && q && Number(q) > 0) {
                  onAdd(sel.id, Number(q), sel.baseUnit);
                }
              }}
            />
          </Fld>
          {q && Number(q) > 0 && (
            <div style={{ fontFamily: T.mono, fontSize: 13, color: T.accent }}>
              = {fmt(Number(q) * sel.unitCost)}€
            </div>
          )}
          <button
            onClick={() => q && Number(q) > 0 && onAdd(sel.id, Number(q), sel.baseUnit)}
            disabled={!q || Number(q) <= 0 || saving}
            style={{ ...btnPrimary, opacity: !q || Number(q) <= 0 || saving ? 0.4 : 1, fontSize: 13, padding: "8px 14px" }}
          >
            {saving ? "..." : "Añadir"}
          </button>
          <button
            onClick={() => {
              setSel(null);
              setQ("");
            }}
            style={btnSmall}
          >
            Otro
          </button>
        </div>
      )}
    </div>
  );
}
