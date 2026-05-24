"use client";

import { useState } from "react";
import { Kpi, Fld } from "../ui";
import { T, page, pageTitle, pageSub, tableWrap, tableHead, btnPrimary, btnSmall, btnGhost, input, fmt } from "../theme";
import type { OrgConfig } from "../../hooks/useOrgConfig";

interface OrgConfigSectionProps {
  config: OrgConfig;
  loading: boolean;
  onUpdate: (updates: Partial<OrgConfig>) => Promise<void>;
}

export default function OrgConfigSection({ config, loading, onUpdate }: OrgConfigSectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Location form
  const [lat, setLat] = useState(config.location.lat);
  const [lon, setLon] = useState(config.location.lon);
  const [city, setCity] = useState(config.location.city);
  const [tz, setTz] = useState(config.location.timezone);

  // Thresholds
  const [excellent, setExcellent] = useState(config.foodCostThresholds.excellent);
  const [acceptable, setAcceptable] = useState(config.foodCostThresholds.acceptable);

  // Stations
  const [stations, setStations] = useState(config.stations.join(", "));

  // Currency & language
  const [currency, setCurrency] = useState(config.currency);
  const [language, setLanguage] = useState(config.language);

  const saveLocation = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdate({ location: { lat, lon, timezone: tz, city } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar ubicación");
    } finally {
      setSaving(false);
    }
  };

  const saveThresholds = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdate({ foodCostThresholds: { excellent, acceptable } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar umbrales");
    } finally {
      setSaving(false);
    }
  };

  const saveStations = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdate({ stations: stations.split(",").map(s => s.trim()).filter(Boolean) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar estaciones");
    } finally {
      setSaving(false);
    }
  };

  const saveGeneral = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdate({ currency, language });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={page}><p style={{ color: T.dim }}>Cargando configuración...</p></div>;

  const inputStyle = { ...input, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "auto" };
  const selectStyle = { ...input, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "auto" };

  return (
    <div style={page}>
      <h1 style={pageTitle}>Configuración de organización</h1>
      <p style={pageSub}>Personaliza parámetros para tu negocio — se aplican a toda la plataforma</p>

      {error && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: "#fee2e2", border: "1px solid #fecaca", borderRadius: 4, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Location */}
        <div style={tableWrap}>
          <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>📍 Ubicación</span></div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <Fld label="Ciudad"><input disabled={saving} value={city} onChange={e => setCity(e.target.value)} style={{ ...inputStyle, width: "100%" }} /></Fld>
            <div style={{ display: "flex", gap: 12 }}>
              <Fld label="Latitud"><input disabled={saving} type="number" step="0.0001" value={lat} onChange={e => setLat(Number(e.target.value))} style={{ ...inputStyle, width: "100%" }} /></Fld>
              <Fld label="Longitud"><input disabled={saving} type="number" step="0.0001" value={lon} onChange={e => setLon(Number(e.target.value))} style={{ ...inputStyle, width: "100%" }} /></Fld>
            </div>
            <Fld label="Zona horaria"><input disabled={saving} value={tz} onChange={e => setTz(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="Europe/Madrid" /></Fld>
            <button onClick={saveLocation} disabled={saving} style={{ ...btnPrimary, alignSelf: "flex-end", fontSize: 12, padding: "8px 14px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "..." : "Guardar"}</button>
          </div>
        </div>

        {/* Food cost thresholds */}
        <div style={tableWrap}>
          <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>📊 Umbrales de Food Cost</span></div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Fld label="Excelente (≤ %)">
                <input disabled={saving} type="number" value={excellent} onChange={e => setExcellent(Number(e.target.value))} style={{ ...inputStyle, width: 80 }} />
              </Fld>
              <Fld label="Aceptable (≤ %)">
                <input disabled={saving} type="number" value={acceptable} onChange={e => setAcceptable(Number(e.target.value))} style={{ ...inputStyle, width: 80 }} />
              </Fld>
            </div>
            <div style={{ fontSize: 11, color: T.dim }}>
              <span style={{ color: "#16a34a" }}>● ≤{excellent}%</span> = Excelente,{" "}
              <span style={{ color: "#ca8a04" }}>● {excellent}-{acceptable}%</span> = Aceptable,{" "}
              <span style={{ color: "#dc2626" }}>● &gt;{acceptable}%</span> = Alto
            </div>
            <button onClick={saveThresholds} disabled={saving} style={{ ...btnPrimary, alignSelf: "flex-end", fontSize: 12, padding: "8px 14px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "..." : "Guardar"}</button>
          </div>
        </div>

        {/* Stations */}
        <div style={tableWrap}>
          <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>🏷️ Estaciones de trabajo</span></div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <Fld label="Estaciones (separadas por coma)">
              <input disabled={saving} value={stations} onChange={e => setStations(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="espresso, cold, food, entrega" />
            </Fld>
            <div style={{ fontSize: 11, color: T.dim }}>Se usan en SKU Master para clasificar productos por estación</div>
            <button onClick={saveStations} disabled={saving} style={{ ...btnPrimary, alignSelf: "flex-end", fontSize: 12, padding: "8px 14px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "..." : "Guardar"}</button>
          </div>
        </div>

        {/* General */}
        <div style={tableWrap}>
          <div style={tableHead}><span style={{ fontWeight: 600, fontSize: 13 }}>⚙️ General</span></div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Fld label="Moneda">
                <select disabled={saving} value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...selectStyle, width: 100 }}>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="MXN">MXN ($)</option>
                  <option value="COP">COP ($)</option>
                </select>
              </Fld>
              <Fld label="Idioma">
                <select disabled={saving} value={language} onChange={e => setLanguage(e.target.value)} style={{ ...selectStyle, width: 100 }}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </Fld>
            </div>
            <button onClick={saveGeneral} disabled={saving} style={{ ...btnPrimary, alignSelf: "flex-end", fontSize: 12, padding: "8px 14px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "..." : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
