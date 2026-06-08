/**
 * tenant.ts — fuente única del orgId de Raíz y Grano en la PWA.
 *
 * apps/app es SINGLE-TENANT (solo Raíz y Grano). Antes el orgId se hardcodeaba
 * como "raiz_y_grano" en ~17 sitios; ahora todos importan RAIZ_ORG_ID de aquí.
 * Si algún día esta app sirviera otra org, este es el único punto a tocar.
 * Ver docs/RAIZ-VS-ENVERDE.md (sección "Constante canónica").
 */
export const RAIZ_ORG_ID = "raiz_y_grano";
