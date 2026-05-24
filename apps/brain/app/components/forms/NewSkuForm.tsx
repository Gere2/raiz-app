"use client";

import { useState } from "react";
import { T, modalTitle, input, btnPrimary, btnSmall, fmt } from "../theme";
import { Fld } from "../ui";

type Product = { id: string; name: string; price: number; categoryId: string | null; categoryName: string; origin?: string | null };
type Recipe = { id: string; name: string; yieldQty: number; yieldUnit: string; sellingPrice: number; totalCost: number; foodCostPct: number; productId?: string; productName?: string; ingredients?: unknown[] };
type Packaging = { id: string; name: string; items: Array<{ name: string; unitCost: number; qty: number }>; totalCost: number; version: number };

export default function NewSkuForm({ products, recipes, packagings, onSave, saving, onClose }: { products: Product[]; recipes: Recipe[]; packagings: Packaging[]; onSave: (d: Record<string, unknown>) => void; saving: boolean; onClose?: () => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [station, setStation] = useState("espresso");
  const [time, setTime] = useState(0);
  const [posId, setPosId] = useState("");
  const [price, setPrice] = useState(0);
  const [recipeId, setRecipeId] = useState("");
  const [packId, setPackId] = useState("");

  const onPosChange = (id: string) => {
    setPosId(id);
    const p = products.find(x => x.id === id);
    if (p) {
      if (!name) setName(p.name);
      setPrice(p.price);
      setCat(p.categoryName);
    }
  };

  const selectedRecipe = recipes.find(r => r.id === recipeId);
  const selectedPack = packagings.find(p => p.id === packId);
  const recipeCost = selectedRecipe?.totalCost || 0;
  const packCost = selectedPack?.totalCost || 0;
  const totalCost = recipeCost + packCost;
  const margin = price - totalCost;

  return (
    <div>
      <h2 style={modalTitle}>Nuevo SKU Master</h2>
      <fieldset disabled={saving} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: saving ? 0.6 : 1 }}>
          <Fld label="Producto POS">
            <select value={posId} onChange={e => onPosChange(e.target.value)} style={{ ...input, width: "100%" }}>
              <option value="">— Vincular a producto POS —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({fmt(p.price)}€)</option>)}
            </select>
          </Fld>
          <div style={{ display: "flex", gap: 12 }}>
            <Fld label="Nombre SKU">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Cafe Latte" style={{ ...input, flex: 1, minWidth: 160 }} autoFocus />
            </Fld>
            <Fld label="Categoría">
              <input value={cat} onChange={e => setCat(e.target.value)} placeholder="Cafés" style={{ ...input, width: 120 }} />
            </Fld>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Fld label="Estación">
              <select value={station} onChange={e => setStation(e.target.value)} style={{ ...input, width: 120 }}>
                {["espresso", "cold", "food", "entrega"].map(s => <option key={s}>{s}</option>)}
              </select>
            </Fld>
            <Fld label="Tiempo (seg)">
              <input type="number" value={time} onChange={e => setTime(Number(e.target.value))} style={{ ...input, width: 80, fontFamily: T.mono }} />
            </Fld>
            <Fld label="PVP (€)">
              <input type="number" step="0.1" value={price} onChange={e => setPrice(Number(e.target.value))} style={{ ...input, width: 80, fontFamily: T.mono }} />
            </Fld>
          </div>
          <Fld label="Receta/Escandallo">
            <select value={recipeId} onChange={e => setRecipeId(e.target.value)} style={{ ...input, width: "100%" }}>
              <option value="">— Sin receta —</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name} ({fmt(r.totalCost)}€)</option>)}
            </select>
          </Fld>
          <Fld label="Packaging">
            <select value={packId} onChange={e => setPackId(e.target.value)} style={{ ...input, width: "100%" }}>
              <option value="">— Sin packaging —</option>
              {packagings.map(p => <option key={p.id} value={p.id}>{p.name} ({fmt(p.totalCost)}€)</option>)}
            </select>
          </Fld>

          {/* Live cost preview */}
          {(recipeId || packId) && (
            <div style={{ background: T.bg, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", fontSize: 12, fontFamily: T.mono }}>
              <span style={{ color: T.muted }}>Receta: {fmt(recipeCost)}€</span>
              <span style={{ color: T.muted }}>Pack: {fmt(packCost)}€</span>
              <span style={{ color: T.text, fontWeight: 700 }}>Total: {fmt(totalCost)}€</span>
              {price > 0 && <span style={{ color: margin > 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>Margen: {fmt(margin)}€</span>}
            </div>
          )}
        </div>
      </fieldset>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button onClick={() => onClose?.()} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave({ name: name.trim(), category: cat, station, standardTimeSec: time, posProductId: posId || null, sellingPrice: price, recipeId: recipeId || null, packagingId: packId || null })} disabled={!name.trim() || saving} style={{ ...btnPrimary, opacity: !name.trim() || saving ? 0.4 : 1 }}>{saving ? "Guardando..." : "Crear SKU"}</button>
      </div>
    </div>
  );
}
