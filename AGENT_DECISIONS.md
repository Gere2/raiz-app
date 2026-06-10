# AGENT_DECISIONS — Enverde pre-piloto

> Decisiones de producto y técnicas tomadas en la fase pre-piloto, con su
> porqué. Complementa [AGENT_STATUS.md](AGENT_STATUS.md). Actualizado: **2026-06-10**.

## Producto

- **Deep-link de vinculación por hash** (`#resumen-rentabilidad:vincular`), no
  query param ni estado global: extiende la convención de ancla existente
  (`#resumen-rentabilidad`), no fuerza recarga (un query param con `<a>` plano
  recarga la página en App Router) y el Resumen solo LEE el hash — nunca lo
  escribe — así que no puede haber loops con `hashchange`. La constante vive en
  `ProfitabilitySummary` (`RESUMEN_VINCULAR_HASH`) como único punto de verdad.
- **El panel de vinculación nunca abre vacío**: la acción semántica
  `link-products` solo se emite desde `lib/profitability/readiness` cuando hay
  productos del TPV sin coste (`missingEscandallo.count > 0`); en el resto de
  casos el CTA es `summary` a secas. Con un hash viejo y nada que vincular, el
  efecto se limita al scroll.
- **Clic repetido idempotente**: si el hash ya está en la URL el navegador no
  emite `hashchange`, así que la checklist lo emite sintético; el Resumen
  re-aplica con `force=true` en eventos y mantiene el guard solo para recargas
  de `data` (no re-scrollea mientras el usuario vincula productos).
- **Honestidad antes que estética**: "Productos a revisar" solo afirma
  "margen sano" si existe al menos un producto vendido con coste
  (`topProduct !== null`); con cero datos muestra "—" y "se llenará con ventas
  y costes". Misma filosofía que "sin coste no hay margen".
- **NO se podaron los múltiples puntos de entrada a "subir extracto"**
  (Resumen, checklist, tarjeta "Caja y sueldo", demo): cada uno cumple un rol
  distinto (diagnóstico / guía / navegación / ejemplo) y podarlos era
  embellecer, no reducir clics del piloto. Revisar tras observar uso real.
- **Regla de fase**: feature freeze hasta observar uso real de cafeterías del
  piloto; solo se toca código por bug crítico.

## Validación

- **Validación e2e en prod con org throwaway, no staging**: org
  `enverde-flow-val` provisionada por Admin SDK (patrón de
  `scripts/enverde-quickcost-e2e.mjs`), UI real con Chrome headless
  (playwright-core) logueado vía `/enverde-login?token=…`, llamadas de producto
  con idToken del café contra app.enverde.app. Autolimpieza verificada.
- **Ticket sembrado con la forma del POS cuando la UI no es manejable
  headless**: la carta del TPV agrupa por `categories`, así que un producto
  sembrado solo en `orgs/{org}/products` no se renderiza; el ticket se sembró
  por Admin SDK con la forma exacta de `ticket-service` (precedente: e2e de
  coste rápido). Si algún día se siembran cartas por script, sembrar también
  `categories`.
- **Los scripts de validación son temporales y se borran** al terminar
  (working tree limpio); la evidencia queda en capturas y en este registro, no
  en código muerto en `scripts/`.

## Plataforma (contexto heredado relevante)

- **Panel canónico de Enverde = brain (app.enverde.app)**; el marketplace es
  solo funnel. Una app, dos marcas.
- **Rules de Firestore** (`1b8dc21`): orders create atribuido, orgs create solo
  por Admin SDK, secrets/usage fuera del alcance del client SDK. El deploy de
  rules es manual y deliberadamente fuera del workflow Vercel-only.
- **Orgs de prueba se purgan con guardas** (`apps/brain/scripts/purge-enverde-test-orgs.mjs`):
  solo `source=enverde` + patrón de test, dry-run por defecto.
