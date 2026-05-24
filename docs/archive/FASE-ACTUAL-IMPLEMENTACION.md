# Raíz y Grano — Fase Actual: Implementación Completa

## Track A: Robustez / Production Readiness + Track B: POS Alta Velocidad

---

## 1. Estado Actual Revisado

### A. Lo que ya está bien resuelto

- **Ledger transaccional**: Todas las operaciones de puntos pasan por `loyalty-engine.ts` con transacciones atómicas de Firestore, idempotency keys y balance-after tracking
- **Org isolation**: Firestore rules endurecidas, orgId en todas las queries
- **Badge race condition cerrada**: Transacciones atómicas previenen duplicados
- **Redemption expiry enforcement**: Server-side en Brain API (PR7)
- **Quiz cap server-side**: 300 pts/semana con cap parcial
- **Event model base**: Tier 1 (domain) + Tier 2 (analytics) con logLoyaltyEvent
- **Brain API completa**: 12 endpoints loyalty, todos con auth Bearer + staff checks
- **App standalone en Vercel**: CERO imports de `@raiz/shared`
- **108 tests pasando** (30 loyalty-engine + 31 hardening + 47 nuevos)

### B. Lo que seguía abierto y era crítico (ahora cerrado)

- **POS redemptions vía Firestore client-side** → **MIGRADO** a Brain API
- **POS lento para hora punta** → **REDISEÑADO** con quick-tap, combos, modo pico
- **Sin observabilidad** → **IMPLEMENTADA** con logs estructurados JSON en todos los endpoints
- **Sin jobs de expiración** → **CREADO** cron endpoint + Vercel cron config
- **Sin snapshots de economía** → **CREADO** endpoint de snapshot
- **Sin panel operativo** → **CREADO** control tower mínima en Brain

### C. Deuda aceptable por ahora

- Weather enrichment en ticket-service usa API externa sin cache largo (aceptable)
- Product stats se actualizan en background fire-and-forget (aceptable)
- El POS calcula puntos client-side para award (loyalty-points-service.ts) — esto debería migrar a Brain API eventualmente, pero funciona porque Firestore rules protegen
- Combos están hardcodeados en `pos-combos.ts` — futuro: gestionarlos desde Brain
- Modifiers no tienen descuentos de combo — futuro: pricing engine

### D. Lo que se tocó en esta iteración

| Cambio | Archivo(s) | Track |
|--------|-----------|-------|
| Migración redemptions a Brain API | `pos/lib/redemption-service.ts` | A |
| RedemptionValidator con props user/orgId | `pos/components/pos/redemption-validator.tsx` | A |
| Logs estructurados en 11 endpoints Brain | `brain/app/api/org/*/loyalty/*/route.ts` | A |
| Cron de expiración + vercel.json | `brain/app/api/cron/expire-redemptions/route.ts` | A |
| Snapshot de economía | `brain/app/api/org/*/loyalty/snapshot/route.ts` | A |
| Control tower mínima | `brain/app/control-tower/page.tsx + client.tsx` | A |
| Smoke test script | `brain/scripts/smoke-test.sh` | A |
| POS completo rediseñado | `pos/app/pos/page.tsx` (rewrite completo) | B |
| Combos de un toque | `pos/lib/pos-combos.ts` | B |
| Modifiers inline | `pos/lib/pos-modifiers.ts` | B |
| Métricas POS | `pos/lib/pos-metrics.ts` | B |
| OrderItemModifier type | `pos/lib/ticket-service.ts` | B |
| 47 tests nuevos | `brain/__tests__/` (3 archivos) | A+B |

---

## 2. Track A — Cierre Operativo y Production Readiness

### 2.1 Migración POS a Brain API para Redemptions

**Antes**: `redemption-service.ts` importaba Firestore client SDK, hacía queries directas a `redemptions` collection, y updateDoc para marcar como usadas.

**Ahora**: El servicio es un cliente HTTP puro que llama a Brain API:

```
validateRedemptionCode(user, orgId, code)
  → POST /api/org/{orgId}/loyalty/redemption-validate
  → Respuesta tipada: valid + redemption | error code

useRedemption(user, orgId, redemptionId)
  → POST /api/org/{orgId}/loyalty/redemption-use
  → Respuesta tipada: success | error code
```

Manejo de errores cubierto: 401 (no autorizado), 403 (forbidden), 404 (no encontrado), 410 (expirado), 5xx (error servidor), network error.

Cada operación genera un log estructurado JSON en consola del POS y en el servidor Brain.

### 2.2 Observabilidad

Todos los endpoints de Brain ahora emiten logs JSON estructurados:

```json
{
  "op": "redemption.validate",
  "orgId": "org-001",
  "code": "ABC123",
  "result": "valid",
  "actorId": "uid-staff",
  "ts": "2026-03-15T12:00:00.000Z"
}
```

Endpoints con logging: award, balance, economy, expire-redemptions, mission-complete, quiz-complete, reconcile (GET+POST), redeem, redemption-validate, redemption-use, reverse.

### 2.3 Jobs y Snapshots

**Expiry Cron**: `GET /api/cron/expire-redemptions` protegido por `CRON_SECRET`. Itera todas las orgs, llama a `expireStaleRedemptions()` del loyalty-engine. Configurado en `vercel.json` para ejecutar diariamente a las 3 AM UTC.

**Snapshots**: `GET/POST /api/org/{orgId}/loyalty/snapshot` almacena estado actual de la economía en `orgs/{orgId}/loyalty_snapshots`. Incluye totalPointsIssued, totalPointsRedeemed, pointsInCirculation, activeRedemptions, uniqueUsers.

### 2.4 Brain Control Tower Mínima

Panel en `/control-tower` con tres secciones:

1. **Loyalty Economy**: Puntos emitidos, canjeados, en circulación, liability estimada, earn sources, redemption sinks
2. **Redemption Operations**: Pending, used, expired counts
3. **Reconcile / Drift**: Input para verificar drift de un UID específico, botón para ejecutar expire sweep

### 2.5 Smoke Tests

Script bash en `scripts/smoke-test.sh` que verifica:
- Balance endpoint
- Redemption validate
- Reconcile
- Economy
- Expire redemptions

Salida con colores: verde = pass, rojo = fail, resumen al final.

---

## 3. Track B — POS de Alta Velocidad

### 3.1 Auditoría de Fricciones

**Fricciones críticas eliminadas:**
- Tocar producto abría toast → ahora: feedback visual instantáneo (pulse)
- Cobrar requería 2-step modal obligatorio → ahora: botones directos Efectivo/Tarjeta
- Grid de productos de 200px → ahora: grid flexible que ocupa toda la pantalla
- No había combos → ahora: combos de un toque
- No había undo → ahora: stack de undo con auto-expire 30s

**Fricciones importantes eliminadas:**
- No había modo pico → ahora: toggle ⚡ que reduce a top 12 productos + combos
- No había modifiers → ahora: chips inline al tocar item en ticket
- Ticket poco visible → ahora: sidebar fija con total grande y botones de pago prominentes

### 3.2 Diseño del Nuevo POS

Layout de pantalla completa, sin scroll:

```
┌─────────────────────────────────────────────────┐
│ [🌱] Raíz y Grano   [🔍] [⚡Peak] [📱] [←]    │
├─────────────────────────────────────────────────┤
│ [☕Café] [🥐Bollería] [🥤Bebidas] ...          │
├────────────────────────────┬────────────────────┤
│                            │  TICKET            │
│  ┌────┐ ┌────┐ ┌────┐    │  2x Café    3.00€  │
│  │1.50│ │1.80│ │2.50│    │  1x Latte   2.50€  │
│  │Café│ │Cort│ │Latt│    │  [mods inline]      │
│  └────┘ └────┘ └────┘    │                     │
│  ┌────┐ ┌────┐ ┌────┐    │  Total: 5.50€      │
│  │2.00│ │1.50│ │2.50│    │  [↩Deshacer]        │
│  │Tost│ │Bizc│ │Zumo│    │  [💵Cash] [💳Card]  │
│  └────┘ └────┘ └────┘    │  [Clasificar|Limpiar│
└────────────────────────────┴────────────────────┘
```

### 3.3 Funcionalidades Implementadas

**Instant Add**: Touch = añade al ticket. Segundo touch = +1 cantidad. Sin toast, sin popup, sin modal. Feedback visual: pulse CSS en el botón.

**Undo System**: Stack de 10 acciones, auto-expire 30s. Botón visible cuando hay acciones. Restaura el estado completo del ticket.

**Peak Mode**: Toggle ⚡ en header. Muestra solo top 12 productos (favoritos + categoría actual). Grid 3 columnas con botones grandes. Combos visibles arriba. Fondo sutil amber. Estado persistido en localStorage.

**Combos de un toque**: 4 combos predefinidos (Café+Bizcocho, Café+Tostada, Matcha+Galleta, Doble Café). Un toque = todos los items entran al ticket. Match por nombre de producto (case-insensitive, parcial).

**Modifiers Inline**: Toque en item del ticket expande panel de chips. 8 modifiers: Leche vegetal (+0.30€), Extra shot (+0.40€), Doble shot (+0.60€), Descafeinado, Sin azúcar, Con hielo, Ligero, Leche normal. Toggle on/off. Precio ajustado en tiempo real.

**Quick Payment**: Dos botones grandes directos: Efectivo (verde) y Tarjeta (azul). Un toque = genera ticket inmediatamente. Clasificación opcional vía link "Clasificar" que abre el modal completo existente.

**Métricas**: `PosMetricsTracker` clase singleton. Mide: startTime, tapCount, comboUsed, peakMode, undoCount, duration_ms, total, paymentMethod. Log JSON en consola al completar ticket.

---

## 4. Cómo Conviven Seguridad y Velocidad

La validación de redemptions vía Brain API es **asíncrona y no bloquea el flujo de tikado**. El barista puede seguir tikando productos mientras se valida un código.

Diseño de compatibilidad:
- El RedemptionValidator es un componente independiente al pie del ticket
- No interfiere con el flujo principal de añadir productos / cobrar
- Si Brain API tarda, el POS sigue operativo (el barista puede cobrar sin esperar)
- Si Brain API falla, se muestra error claro sin frenar el resto del POS
- Los botones de pago rápido (Cash/Card) no dependen de redemptions
- La clasificación de cliente es OPCIONAL y separada del cobro

---

## 5. Tests

**108 tests totales, todos pasando:**

| Archivo | Tests | Tipo |
|---------|-------|------|
| loyalty-engine.test.ts | 30 | Unit (lógica pura) |
| loyalty-hardening.test.ts | 31 | Unit (invariantes) |
| redemption-api.test.ts | 15 | Contract (shapes) |
| pos-speed.test.ts | 18 | Unit (combos, mods, metrics) |
| redemption-service-client.test.ts | 14 | Unit (client HTTP mock) |

---

## 6. Logs, Métricas y Jobs

### Logs Estructurados
Todos los endpoints Brain emiten JSON con: op, orgId, actorId, resultado, timestamp, datos relevantes.

### Métricas POS
Cada ticket completo genera log con: duration_ms, tapCount, itemCount, comboUsed, peakMode, undoCount, total, paymentMethod.

### Jobs
- **Expiry cron**: Diario a las 3 AM UTC via Vercel Cron
- **Snapshots**: Manual vía POST a /loyalty/snapshot (staff-only)
- **Reconcile**: Manual vía POST a /loyalty/reconcile (staff-only)

---

## 7. Roadmap por PRs

### PR9 — POS Migration to Brain Redemption API

**Objetivo**: Eliminar acceso client-side a Firestore para redemptions.

**Archivos**:
- `apps/pos/src/lib/redemption-service.ts` (rewrite)
- `apps/pos/src/components/pos/redemption-validator.tsx` (update props)
- `apps/pos/src/app/pos/page.tsx` (pass user/orgId)
- `apps/brain/app/api/org/[orgId]/loyalty/redemption-validate/route.ts` (add logs)
- `apps/brain/app/api/org/[orgId]/loyalty/redemption-use/route.ts` (add logs)

**Riesgo**: Bajo. El flujo client-side se reemplaza por calls HTTP. Si Brain está caído, el POS muestra error claro.
**Rollout**: Feature flag posible (env var para elegir client vs server).
**Validación**: Tests + smoke test manual con código válido, expirado, y no existente.
**Rollback**: Revertir redemption-service.ts al estado anterior (imports Firestore).

### PR10 — POS Quick Tap / Direct Add / Combos / Undo

**Objetivo**: POS de alta velocidad para hora punta.

**Archivos**:
- `apps/pos/src/app/pos/page.tsx` (rewrite completo)
- `apps/pos/src/lib/pos-combos.ts` (nuevo)
- `apps/pos/src/lib/pos-modifiers.ts` (nuevo)
- `apps/pos/src/lib/pos-metrics.ts` (nuevo)
- `apps/pos/src/lib/ticket-service.ts` (add OrderItemModifier)

**Riesgo**: Medio. Es un rewrite del POS page. Validar bien en staging.
**Rollout**: Deploy a staging primero. Probar con baristas reales antes de producción.
**Validación**: Manual en tablet/móvil. Tests unitarios para combos/modifiers/metrics.
**Rollback**: Revertir page.tsx al estado anterior.

### PR11 — Modo Pico + Modifiers Inline + Métricas Base

**Nota**: Ya incluido en PR10 como parte del rewrite. Si se quiere separar, extraer:
- Peak mode toggle logic
- MODIFIERS constant y UI
- PosMetricsTracker class

### PR12 — Observabilidad + Smoke Tests + Jobs/Snapshots

**Objetivo**: Sistema operable y medible.

**Archivos**:
- 9 route files Brain (add structured logs)
- `apps/brain/app/api/cron/expire-redemptions/route.ts` (nuevo)
- `apps/brain/vercel.json` (nuevo)
- `apps/brain/app/api/org/[orgId]/loyalty/snapshot/route.ts` (nuevo)
- `apps/brain/scripts/smoke-test.sh` (nuevo)

**Riesgo**: Bajo. Los logs son aditivos, no cambian lógica. El cron es un GET protegido.
**Rollout**: Deploy directo. Verificar cron en Vercel dashboard.
**Validación**: Ejecutar smoke-test.sh contra staging.
**Rollback**: Los logs pueden quedarse. Deshabilitar cron en vercel.json si hay problemas.

### PR13 — Brain Control Tower Mínima

**Objetivo**: Panel operativo para gestionar loyalty sin acceso directo a Firestore.

**Archivos**:
- `apps/brain/app/control-tower/page.tsx` (nuevo)
- `apps/brain/app/control-tower/client.tsx` (nuevo)

**Riesgo**: Bajo. Es una página nueva que consume endpoints existentes.
**Rollout**: Deploy directo. Proteger con auth en middleware si necesario.
**Validación**: Acceder al panel y verificar datos.
**Rollback**: Eliminar directorio control-tower.

---

## 8. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Brain API caída → POS no valida redemptions | Baja | Medio | Error claro en UI, POS sigue operativo para tikado/cobro |
| Baristas no se adaptan al nuevo POS | Media | Medio | Toggle para modo pico es opcional, cobro rápido coexiste con clasificación completa |
| Combos no matchean productos del catálogo | Baja | Bajo | Match parcial case-insensitive, toast si no encuentra, graceful skip |
| Cron de expiración falla | Baja | Bajo | Auto-expire on read ya existe, el cron es un safety net adicional |
| NEXT_PUBLIC_BRAIN_API_URL no configurada en POS | Media | Alto | Necesario añadir a `.env.local` del POS antes de deploy |

### Acción requerida antes de deploy
Añadir a `apps/pos/.env.local`:
```
NEXT_PUBLIC_BRAIN_API_URL=https://brain.raizygrano.com
```

---

## 9. Próximos Pasos Opcionales

1. **Migrar award points a Brain API**: Actualmente POS escribe puntos client-side vía loyalty-points-service.ts. Debería pasar por Brain como hace App.
2. **Combos dinámicos desde Brain**: Mover QUICK_COMBOS a Firestore/Brain API, gestionar desde control tower.
3. **Modo pico automático**: Activar por franja horaria (8-10am, 12-14pm) en vez de toggle manual.
4. **Favoritos por franja**: Diferentes favoritos para mañana vs tarde.
5. **Keyboard shortcuts**: Atajos de teclado para tablets con teclado (1-9 para top productos, Enter para cobrar).
6. **Métricas a dashboard**: Enviar pos.ticket_complete events a un analytics service o Firestore.
7. **Inventory deduction on sale**: Descontar stock automáticamente al generar ticket.
