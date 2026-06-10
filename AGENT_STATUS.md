# AGENT_STATUS — Enverde pre-piloto

> Estado técnico al cierre de la fase pre-piloto. Actualizado: **2026-06-10**.
> Rama de trabajo: `rescue/brain-prod-snapshot-enverde-free-first`.
> Deploy: `apps/brain` → Vercel proyecto `brain` → alias **app.enverde.app** (READY).

## Estado actual de Enverde

El hub `/org/[orgId]` de app.enverde.app es el panel canónico de Enverde y está
completo para piloto:

- **Resumen de rentabilidad** con ventas reales del TPV como fuente prioritaria
  (POS > manual > estimación). Sin coste no se inventa margen; con coste
  aproximado el margen se marca como estimado.
- **Lectura rápida**: diagnóstico por reglas puras y trazables (`lib/profitability/insights`).
- **Checklist "Puesta a punto del diagnóstico"** (`lib/profitability/readiness`):
  6 pasos con estados completado/atención/pendiente derivados del mismo payload.
- **Vinculación TPV ↔ escandallo** desde el aviso del Resumen, con coste rápido
  aproximado opcional.
- El CTA "Vincular productos" de la checklist abre el panel de vinculación
  directamente (hash `#resumen-rentabilidad:vincular`), solo si hay productos
  sin coste; el clic repetido también funciona.
- Hub honesto en vacío: "Productos a revisar" no afirma "margen sano" sin datos.

## Últimos commits relevantes

| Commit | Qué |
| --- | --- |
| `c355f08` | Hub honesto en vacío + CTA de vincular idempotente |
| `8715f0e` | CTA "Vincular productos" de la checklist abre el panel directo |
| `72892c4` | Checklist "Puesta a punto del diagnóstico" |
| `1b8dc21` | Rules endurecidas (orders create atribuido, orgs create solo Admin SDK, secrets/usage fuera del cliente). **Desplegadas y verificadas contra la API** (2026-06-10): ruleset activo `10f111b4` creado 09:40:28Z, fuente idéntica byte a byte a `firestore.rules`@1b8dc21. `config/*` revisado el mismo día: solo `fiscalData` (lo impreso en ticket) + `ticketCounter`, nada sensible (detalle en AUDIT_ENVERDE_REPO.md §14). El deploy de rules es manual (`firebase deploy --only firestore:rules`), fuera del workflow Vercel-only. |
| `0e26fae` | Registro de la org de validación pre-piloto en el script de purga (purga ya aplicada) |

## Flujo e2e validado en producción (2026-06-10)

Validación contra app.enverde.app con org throwaway `enverde-flow-val`
(provisión por Admin SDK + Chrome headless + API real con idToken del café).
**14/14 checks en verde, cero cambios de código necesarios.** Datos de prueba
limpiados y verificados (org + subcolecciones + users/{uid} + Auth user).

1. Login bridge `/enverde-login` → hub. ✓
2. "Abrir TPV" desde el hub → handoff logueado en pos.raizygrano.com. ✓
3. Ticket POS en `orgs/{orgId}/tickets` (sembrado con la forma exacta que
   escribe `ticket-service` del POS; ver riesgo de `categories` abajo). ✓
4. Márgenes detecta el producto vendido sin escandallo (margen 0, no inventado;
   insight "Te faltan escandallos"). ✓
5. Checklist propone "Vincular productos". ✓
6. CTA → scroll al Resumen + panel de vinculación abierto listando el missing. ✓
7. Cerrar + clic repetido con el hash ya puesto → el panel reabre. ✓
8. Tras vincular escandallo (POST recipes 200), recarga con hash viejo → el
   panel NO abre vacío y el paso de la checklist pasa a completado. ✓

## Riesgos pendientes

- **Cartas sembradas por script**: un producto creado solo en
  `orgs/{org}/products` no aparece en la carta del TPV (la UI agrupa por
  `categories`). En el flujo real los productos se crean desde el TPV, que lo
  gestiona; afecta solo a seeds/scripts.
- **`tsc --noEmit` en apps/brain**: 3 errores preexistentes (TS2367) en
  `__tests__/loyalty-engine.test.ts` y `__tests__/loyalty-hardening.test.ts`,
  ajenos a Enverde. Lint y `next build` están verdes.
- **Validación humana pendiente**: todo lo anterior se validó con org
  throwaway; falta una cafetería real usándolo sin acompañamiento.

## Siguiente paso

**Lanzar el piloto con cafeterías reales usando enverde.app/piloto.**

## Regla de fase

**No más features antes de observar uso real, salvo bug crítico.**
