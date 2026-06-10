# AUDIT_ENVERDE_REPO — Auditoría completa pre-piloto

> **2026-06-10** · Auditoría read-only de los repos `raiz-app` y `marketplace`
> (Enverde / Raíz / Brain / POS / Marketplace). Sin cambios de código, sin
> deploys. Preguntas técnicas 1 y 2 (§14) cerradas el mismo día con evidencia.
> Complementa [AGENT_STATUS.md](AGENT_STATUS.md) y
> [AGENT_DECISIONS.md](AGENT_DECISIONS.md).

---

## 1. Resumen ejecutivo

Enverde V1 piloto **existe de verdad y el flujo crítico está validado en
producción con evidencia** (e2e 14/14 el 2026-06-10). El sistema es: funnel
público en `enverde.app` (marketplace), alta sin contraseña en `/activar`,
panel del café en `app.enverde.app` (brain), TPV en `pos.raizygrano.com`, y un
motor de rentabilidad honesto (no inventa margen sin coste, marca lo estimado).

Lo que falta no es código: es **validación humana** (un extracto bancario real,
una carta creada por un café real, un móvil real) y **observación de uso**. No
se encontró ningún P0. Los P1 son de promesa, no técnicos: el sueldo
recomendado depende de que el extracto real se procese bien (nunca probado con
un banco real), y "ventas reales del TPV" solo aplica si el café usa ESTE TPV.

Recomendación central: **feature freeze (ya acordado) + 1 cafetería amiga
guiada antes de enviar `/piloto` a las 10**.

## 2. Mapa del sistema

```
enverde.app ──(middleware rewrite host→/cafe)──> marketplace (repo marketplace)
  │  /            landing /cafe (free-first)         Next 16, src/app
  │  /piloto      landing piloto 10 cafés
  │  /demo        demo pública
  │  /activar     alta: POST /api/enverde/start
  │                  └─ tx email→orgId (enverde_signups) + rate limit 6/min
  │                  └─ POST brain /api/enverde/provision (x-enverde-secret)
  ▼
app.enverde.app ──> apps/brain (repo raiz-app, Vercel "brain")
  │  /enverde-login?token   bridge signInWithCustomToken
  │  /org/{orgId}           HUB: Resumen + Lectura rápida + Checklist + Demo
  │  /org/{orgId}/treasury/start   extracto → caja/sueldo
  │  /?section=…            paneles Raíz con nav curada Enverde (brand-aware)
  │  /internal/pilot        dashboard interno agregado (gate admin propio)
  │  /org/{orgId}/activation  dashboard por org
  ▼
pos.raizygrano.com ──> apps/pos (TPV)
  │  /enverde-login?token   handoff desde el hub (custom token, claims org)
  │  /pos                   carta (orgs/{org}/products+categories) → tickets
  ▼
Firestore (proyecto raizygrano)
  orgs/{orgId}/{tickets,recipes,manual_sales,treasury_monthly_snapshots,
                products,categories,members,events,…}   ← multi-tenant
  users/{uid}.orgIds · enverde_signups · org_secrets · enverde_usage (server-only)
  colecciones top-level legacy Raíz (tickets, products, inventory…, staff-only)
```

Tercera app del monorepo: `apps/app` = app de cliente final Raíz (loyalty:
rewards/earn/bono/badges). **No es superficie del piloto Enverde.**

## 3. Estado por módulo

| Módulo | Estado | Nota |
| --- | --- | --- |
| Funnel marketplace (`/cafe`, `/piloto`, `/activar`, `/demo`) | ✅ live, 200 | Copy free-first corregido (e5fcd0e); SEO host-aware; 301 desde lasinguralidad.com |
| Alta `/api/enverde/start` → provision brain | ✅ validado e2e | zod + rate-limit + idempotencia transaccional + secreto compartido |
| Hub `/org/{orgId}` | ✅ validado e2e | Resumen, Lectura rápida, checklist, demo read-only, CTAs directos |
| Vinculación TPV↔escandallo + coste rápido | ✅ validado e2e | panel nunca abre vacío; clic repetido OK; e2e dedicado (51c6a1f) |
| Motor de margen (`lib/profitability/monthly-summary`) | ✅ puro y testeado | POS > manual > estimación; sin coste no hay margen |
| Caja/sueldo (treasury) | ⚠️ live, NO validado con banco real | `treasury_monthly_snapshots`; pipeline extracto probado solo con datos de prueba |
| TPV | ✅ handoff validado | carta multi-tenant org-scoped; checkout NO probado por UI headless |
| Tracking piloto (`/internal/pilot`, `/activation`) | ✅ live | gate admin propio (claim role=admin O doc cafe_users) |
| Feedback piloto | ✅ live | `PilotFeedback` en onboarding/demo |
| Rules Firestore | ✅ desplegadas (1b8dc21) y **verificadas contra la API** (2026-06-10) | org create cerrado; secrets/usage fuera del cliente; ruleset activo idéntico byte a byte (ver §14.1) |
| Loyalty/exam-pass/misiones/bonos (herencia Raíz en brain) | ⚠️ live pero fuera del piloto | 2 tests rotos + 3 errores tsc, dominio loyalty |

## 4. Flujo end-to-end actual (el que vive un café del piloto)

1. Ve `enverde.app/piloto` → "Probar gratis" → `/activar`.
2. Deja nombre + email → org provisionada (idempotente) → aterriza logueado en
   el hub `app.enverde.app/org/{orgId}` sin contraseña.
3. El hub le pide (checklist 6 pasos): ventas (TPV o manual), vincular lo
   vendido a escandallo, coste aproximado, escandallos reales, extracto, lectura.
4. "Abrir TPV" → pos.raizygrano.com logueado → crea carta → cobra → tickets en
   `orgs/{org}/tickets`.
5. El Resumen cruza tickets + recipes + snapshot de caja → margen del mes,
   producto top, productos a revisar, sueldo recomendado.
6. Nosotros observamos `/internal/pilot` y `/org/{org}/activation`.

## 5. Qué está listo para piloto

- Funnel completo → alta → hub → diagnóstico → vinculación (validado).
- Multi-tenancy y aislamiento por membership en datos y APIs.
- Honestidad del diagnóstico (margen no inventado, estimados marcados,
  empty states sin promesas).
- Tracking de activación + dashboards internos + feedback in-app.
- Tiers: Esencial 29 € y Pro 59 € live; Suite "próximamente".

## 6. Qué está validado con evidencia

- **E2e prod 2026-06-10** (org throwaway `enverde-flow-val`, 14/14): login
  bridge, handoff TPV, ticket→missing→checklist→panel→vincular→completado.
  Capturas + AGENT_STATUS.md.
- **Tests**: brain profitability 42/42; suite brain 227/229 (2 fallos
  preexistentes ajenos); marketplace `test:cafe` 10/10; `tsc` marketplace 0
  errores; builds verdes; smoke 200 en enverde.app{,/piloto,/activar} y
  app.enverde.app.
- Handoff `/activar`→brain verificado antes (memoria de sesión 2026-06).

## 7. Qué sigue siendo estimado / no validado

- **Extracto bancario REAL → sueldo recomendado**: nunca probado con un banco
  real de cafetería (formatos raros, encoding, PDFs malos). Es LA promesa del
  folleto.
- **Checkout del TPV por un humano** en móvil/tablet real (e2e solo validó
  handoff y forma del ticket).
- **Snapshot de caja mensual**: frescura/cron con uso continuado.
- Comportamiento en móvil de hub/checklist/panel (validado solo en viewport
  desktop 1280px).
- Expiración de sesión del custom token en visitas de días posteriores.
- El "margen estimado" cuando el POS está vacío (camino `estimate`) con datos
  reales heterogéneos.

## 8. Riesgos

**P0 (seguridad/datos/prod):** ninguno encontrado. Org create cerrado,
provision con secreto + uid derivado, summary org-gated, secrets/usage
server-only, exam-pass/loyalty server-only, seeds con bearer.

**P1 (rompe promesa o piloto):**
- Extracto real sin validar (ver §7): si falla con el primer banco real, la
  promesa central cae en la primera sesión.
- "Ventas reales del TPV" exige usar NUESTRO TPV. Cafetería con TPV ajeno →
  solo ventas manuales; el copy del funnel no lo dice. Ajustar guion/expectativa
  antes de enviar a 10 cafés (no requiere código: es discurso).

**P2 (deuda/UX mejorable):**
- `config/*` legible por cualquier usuario firmado (decisión consciente como
  probe del POS). **Contenido revisado 2026-06-10 vía Admin SDK: no sensible**
  (solo `fiscalData` de Raíz —lo impreso en cada ticket— y `ticketCounter`;
  sin subcolecciones; ver §14.2). Guardarraíl: la regla es `{doc=**}` —
  cualquier doc/subcolección que se añada bajo `config/` queda legible para
  todo usuario firmado; no guardar ahí nada sensible sin tocar la regla.
- `orgs/{orgId}` permite `update, delete` a cualquier miembro desde cliente:
  un café podría romper su propio org doc (auto-daño, no cross-tenant).
- `/business/*` (panel SGL) sigue accesible bajo enverde.app vía SHARED_PATHS;
  mitigado con 307 de /register|/onboarding→/activar, pero un café logueado en
  el panel equivocado seguiría siendo posible por URL directa.
- 2 tests rotos (redemption-service-client: esperan `NEXT_PUBLIC_BRAIN_API_URL`
  en el env de test) + 3 errores `tsc` en tests loyalty.
- `feedback` top-level con `create: if true` (spam posible; sin rate-limit en
  rules — el endpoint del brain sí pasa por API).

**P3 (limpieza futura):**
- 6 docs de fase sin commitear en `marketplace/docs/` (PIVOT, FASE0, FASE2,
  FASE2_2, PILOTO, AUDITORIA 2026-06-08).
- Herencia Raíz conviviendo en el deploy del brain (loyalty, exam-pass,
  misiones, quizzes, control-tower, staging) — oculta por la nav curada, pero
  superficie de build/ataque más grande de lo que el piloto necesita.
- Carta sembrada por script necesita `categories` (afecta solo a seeds).
- `/cafe/raiz`, `/demo/raiz`, `suite-waitlist`: páginas satélite con copy a
  revisar cuando toque (no bloquean).

## 9. Deuda técnica

- tsc brain: 3 × TS2367 en `__tests__/loyalty-*.test.ts` (comparaciones
  imposibles) — arreglo trivial cuando se toque loyalty.
- 2 tests env-dependientes (base URL del cliente de redemptions).
- Dos esquemas de ticket soportados (vivo + legacy) en `normalizeTicketItems`
  y `/margins` — coherentes hoy, mantener en sintonía.
- `requireAdmin` (lib/require-staff) cortocircuita con claim `staff:true`; el
  gate de `/internal/pilot` tuvo que sortearlo con lógica propia — unificar
  algún día.
- Marketplace enorme (≈90 páginas, ≈60 APIs) para lo que Enverde usa de él:
  correcto mientras sea funnel-only, pero cada deploy arrastra todo.

## 10. Duplicidades / piezas muertas

- **Dos paneles para el café**: hub `/org/{orgId}` (diagnóstico) + secciones
  Raíz `/?section=…` (operación). Decisión consciente (hub = casa, secciones =
  herramienta), no duplicado accidental; la nav curada lo sostiene.
- **Dos registros**: el genérico SGL (`/register`) y `/activar`. Resuelto con
  307 en enverde.app; el genérico sigue siendo legítimo para SGL.
- **Top-level legacy Raíz** (`tickets`, `products`, `inventory`…, staff-only)
  vs org-scoped: conviven por diseño durante la migración multi-tenant.
- Scripts de validación temporales: ya borrados (working tree limpio).
- No se encontraron rutas muertas obvias en el funnel Enverde.

## 11. Recomendaciones

1. **No tocar**: motor de margen, rules, loyalty/exam-pass, middleware de
   marca, flujo de provisión. Todo está estable y validado o fuera del piloto.
2. **Validar con humanos, no con código**: extracto real, TPV en móvil, carta
   real. Una cafetería amiga en sesión guiada de 30 min revela más que
   cualquier e2e.
3. **Ajustar el guion del piloto** (no el código): qué pasa si ya tienen TPV
   (ventas manuales), qué prometemos del sueldo (recomendación, no nómina).
4. **Bug policy durante el piloto**: solo se toca código por bug que bloquee
   el flujo crítico (alta, login, TPV, resumen) — lo demás se anota.
5. Cuando haya señales reales: revisar P2 de `/business` en enverde.app antes
   de escalar más allá de 10 cafés (`config/*` ya revisado el 2026-06-10: no
   sensible, ver §14.2).

## 12. Próximos 3 pasos concretos

1. **Sesión guiada con 1 cafetería amiga** (esta semana): alta por
   `/activar` desde SU móvil, extracto real en treasury/start, carta + 3
   tickets reales en el TPV, leer juntos el Resumen. Anotar cada fricción.
2. **Arreglar solo lo que esa sesión rompa** (si algo), re-validar, y entonces
   **enviar enverde.app/piloto a las 10 cafeterías** con el guion ajustado.
3. **Observar 1–2 semanas** `/internal/pilot` + `orgs/{org}/events` + feedback
   in-app; decidir la siguiente feature SOLO desde esas señales.

## 13. Archivos / rutas clave

**raiz-app (brain):**
- `apps/brain/app/org/[orgId]/page.tsx` — hub
- `apps/brain/app/components/sections/Profitability{Summary,Onboarding,Demo}.tsx`
- `apps/brain/lib/profitability/{monthly-summary,insights,readiness}.ts` — motor + reglas puras
- `apps/brain/app/api/org/[orgId]/profitability-summary/route.ts` — lee tickets/recipes/manual_sales/treasury_monthly_snapshots
- `apps/brain/app/api/enverde/{provision,pos-login}/route.ts` — provisión + handoff TPV
- `apps/brain/app/{enverde-login,internal/pilot,org/[orgId]/{activation,treasury/start}}/page.tsx`
- `firestore.rules` (284 líneas, desplegadas 1b8dc21, verificadas contra la API 2026-06-10)
- `scripts/enverde-{quickcost-e2e,pos-login-proof,tpv-smoke}.mjs` + `apps/brain/scripts/purge-enverde-test-orgs.mjs`

**raiz-app (pos):** `apps/pos/src/lib/{ticket,product}-service.ts` (org-scoped), `apps/pos/src/app/{enverde-login,pos}/`

**marketplace:** `src/middleware.ts` (marca/host), `src/app/cafe/{page,piloto,activar}.tsx`, `src/app/api/enverde/start/route.ts`, `src/app/demo/`

## 14. Preguntas abiertas

1. ~~¿Las rules de 1b8dc21 están efectivamente desplegadas?~~ **RESUELTA
   (2026-06-10): SÍ, desplegadas y verificadas.** Evidencia (API
   `firebaserules.googleapis.com`, proyecto `raizygrano`): release
   `cloud.firestore` → ruleset `10f111b4-1728-4b7e-883a-ee1ebc25eb4c`, creado
   `2026-06-10T09:40:28Z` — 4 min después del commit 1b8dc21 (09:36:29Z). La
   fuente del ruleset activo es **idéntica byte a byte** a `firestore.rules`
   en 1b8dc21 (= working tree). No hizo falta re-deploy.
2. ~~¿Qué contiene hoy `config/*`?~~ **RESUELTA (2026-06-10): nada sensible.**
   Dump read-only vía Admin SDK: exactamente 2 docs, sin subcolecciones:
   - `config/fiscalData`: businessName "RAÍZ y GRANO", taxId B56142656
     (CIF de empresa, registro público), address "C/Villagarcia 8 Bj, B",
     phone/email vacíos, additionalInfo "¡Muchas gracias!". Es lo que se
     imprime en cada ticket de Raíz.
   - `config/ticketCounter`: `{ ticketNumber: 1710 }`.
   Sin secretos, tokens, claves ni datos personales. Riesgo residual:
   cualquier café Enverde firmado puede leer el CIF/dirección de Raíz y su
   contador de tickets (volumen acumulado) — irrelevante hoy; ver guardarraíl
   en §8 P2 antes de añadir nada nuevo bajo `config/`.
3. ¿Qué hacemos con cafeterías que ya tienen TPV de terceros? (¿ventas
   manuales como camino oficial del piloto, o integración futura?)
4. ¿Quién atiende el WhatsApp de soporte del piloto y con qué SLA informal?
5. ¿El cron de snapshot mensual de treasury está activo para orgs Enverde
   nuevas, o el snapshot solo existe tras subir extracto manualmente?
6. ¿`apps/app` (cliente loyalty Raíz) entra en el piloto Enverde en algún
   momento, o queda explícitamente fuera hasta después?
