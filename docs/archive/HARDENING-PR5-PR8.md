# Loyalty Hardening — PR5 through PR8

## 1. Diagnóstico por Problema

### PR5: Cross-org leak en `/customers`
**Problema encontrado:** `customer_profiles` es una colección root-level. La ruta original leía TODOS los profiles sin filtrar por `orgId`. Además, `loyalty_transactions` y `redemptions` se consultaban solo por `uid`, no por `orgId`.

**Dónde estaba el bug:**
- `apps/brain/app/api/org/[orgId]/customers/route.ts` — no filtraba por orgId
- `apps/brain/app/api/org/[orgId]/loyalty/balance/route.ts` — queries sin orgId
- `apps/brain/lib/loyalty-engine.ts` — no seteaba orgId en profiles nuevos
- `apps/pos/src/lib/redemption-service.ts` — queries globales de redemptions

### PR6: Badge race condition
**Problema encontrado:** `checkAndAwardBadges()` leía `unlockedBadges`, verificaba condiciones, y escribía. Dos requests concurrentes podían leer el mismo state y ambas otorgar el mismo badge + puntos bonus.

**Dónde estaba el bug:**
- `checkAndAwardBadges()` — read-check-write no atómico
- El premio de puntos por badge no tenía idempotency key dedicada

### PR7: Redemption expiry solo pasivo
**Problema encontrado:** `expiresAt` se guardaba en la redemption pero:
- El POS solo lo verificaba client-side en `lookupRedemptionCode()`
- No había mecanismo server-side de enforcement
- No había transición `pending → expired` automática
- Una redemption expirada podía seguir apareciendo como "active"

### PR8: Quiz cap semanal client-side
**Problema encontrado:** `MAX_WEEKLY_QUIZ_POINTS = 300` vivía en `apps/app/lib/quiz-service.ts`. El server (`completeQuizServer()`) NO verificaba el cap. Un usuario podía llamar al endpoint directamente y acumular puntos ilimitados por quizzes. Además, `answers[]` no se validaba por bounds.

---

## 2. Solución por PR

### PR5: Org Isolation
- Customers route: `WHERE orgId == :orgId` obligatorio
- Balance route: queries scoped por orgId, verificación de profile.orgId
- Loyalty engine: `orgId` siempre se setea en profiles nuevos + backfill-on-touch
- Backfill endpoint: `/api/org/:orgId/customers/backfill-org` (staff only)

### PR6: Badge Race Condition
- `createLoyaltyTx` ya tiene idempotency key `earn.badge:{badgeId}:{uid}`
- Si dos requests llegan simultáneamente, solo una crea transacción; la otra es `duplicate: true`
- `arrayUnion` de Firestore es inherentemente idempotente
- Resultado: doble-premio de puntos imposible, doble-badge en array imposible

### PR7: Redemption Expiry Enforcement
- `validateRedemptionForUse()` — enforcement fuerte en tiempo de canje
- `markRedemptionUsedServer()` — doble-check de expiry antes de marcar used
- `expireStaleRedemptions()` — batch sweep para limpiar pending vencidas
- Balance route: on-read expiry filtering (fire-and-forget update)
- 3 nuevos endpoints Brain:
  - `POST /api/org/:orgId/loyalty/redemption-validate`
  - `POST /api/org/:orgId/loyalty/redemption-use`
  - `POST /api/org/:orgId/loyalty/expire-redemptions`

### PR8: Quiz Cap Server-Side
- `MAX_WEEKLY_QUIZ_POINTS = 300` ahora en loyalty-engine.ts (server)
- `getWeeklyQuizPointsEarned()` calcula desde ledger (source of truth)
- Semana: Lunes 00:00 UTC (ISO week)
- 3 escenarios: below cap → full award, at cap → 0 points, partial → truncated
- Answer index validation (bounds check contra opciones del quiz)
- Respuesta al frontend incluye `cappedByWeekly`, `weeklyCapMessage`
- Quiz attempt SIEMPRE se registra (incluso si cap bloqueó puntos)

---

## 3. Archivos Modificados

### Modificados
| Archivo | PR | Cambio |
|---------|-----|--------|
| `apps/brain/lib/loyalty-engine.ts` | PR5,6,7,8 | orgId on profiles, badge idempotency, expiry functions, quiz cap |
| `apps/brain/app/api/org/[orgId]/customers/route.ts` | PR5 | orgId WHERE clause + stats scoped |
| `apps/brain/app/api/org/[orgId]/loyalty/balance/route.ts` | PR5,7 | orgId scoping + on-read expiry |

### Nuevos
| Archivo | PR | Propósito |
|---------|-----|-----------|
| `apps/brain/app/api/org/[orgId]/loyalty/redemption-validate/route.ts` | PR7 | Validate code server-side |
| `apps/brain/app/api/org/[orgId]/loyalty/redemption-use/route.ts` | PR7 | Mark used server-side |
| `apps/brain/app/api/org/[orgId]/loyalty/expire-redemptions/route.ts` | PR7 | Batch expire sweep |
| `apps/brain/app/api/org/[orgId]/customers/backfill-org/route.ts` | PR5 | Migration endpoint |
| `apps/brain/__tests__/loyalty-hardening.test.mjs` | ALL | 31 tests, 5 suites |

---

## 4. Tests (31 pass, 0 fail)

| Suite | Tests | Covers |
|-------|-------|--------|
| PR5 — Org Isolation | 6 | orgId filtering, backfill, mismatch rejection |
| PR6 — Badge Race Condition | 6 | idempotency keys, arrayUnion, concurrent unlock |
| PR7 — Redemption Expiry | 8 | expiry validation, status transitions, on-read filtering |
| PR8 — Quiz Cap | 9 | cap enforcement, truncation, week boundary, answer validation |
| Event Traceability | 2 | event naming convention, completeness |

Run: `cd apps/brain && node --test __tests__/loyalty-hardening.test.mjs`

---

## 5. Eventos de Dominio

| Evento | Cuándo |
|--------|--------|
| `gamification.badge_unlocked` | Badge desbloqueado (con bonus) |
| `gamification.quiz_completed` | Quiz completado |
| `gamification.quiz_cap_reached` | Usuario alcanzó cap semanal |
| `gamification.quiz_points_blocked` | Puntos truncados por cap parcial |
| `rewards.redeemed` | Reward canjeado |
| `rewards.redemption_expired` | Redemption expiró (at use-time) |
| `rewards.redemption_use_rejected` | Intento de usar redemption inválida |
| `rewards.redemption_used` | Redemption usada exitosamente |
| `rewards.batch_expired` | Batch sweep de expiración |
| `loyalty.points_reversed` | Transacción revertida |

---

## 6. Modelo de Datos Final

### customer_profiles
| Campo | Tipo | Estado |
|-------|------|--------|
| `orgId` | string | **FUENTE** (PR5: obligatorio) |
| `loyaltyPoints` | number | Cache (reconciliable desde ledger) |
| `unlockedBadges` | string[] | Fuente (PR6: arrayUnion idempotente) |
| `completedQuizzes` | string[] | Fuente |
| `completedMissions` | string[] | Fuente |

### redemptions
| Campo | Tipo | Estado |
|-------|------|--------|
| `status` | "pending" / "used" / "expired" | **FUENTE** (PR7: enforced) |
| `expiresAt` | ISO string | Fuente |
| `expiredAt` | ISO string | Derivado (set on transition) |
| `usedAt` | ISO string | Derivado (set on use) |

### loyalty_transactions (ledger)
| Campo | Uso |
|-------|-----|
| `type: "earn.quiz"` | PR8: fuente de verdad para cap semanal |
| `createdAt >= weekStart` | PR8: filtro para cálculo de cap |

### Quiz cap (PR8)
- **No hay counter persistente.** Se calcula on-demand desde el ledger.
- `getWeeklyQuizPointsEarned()` → SUM(earn.quiz WHERE createdAt >= weekStart)
- Esto es correcto porque el ledger ya es la fuente de verdad.

---

## 7. Riesgos Residuales

1. **Backfill de orgId**: Profiles legacy sin `orgId` no serán visibles hasta ejecutar `/backfill-org`. Mitigación: backfill-on-touch en `createLoyaltyTx` (se setea al primer contacto).

2. **POS redemption-service**: Todavía usa client-side Firestore. Idealmente migrar a llamar los nuevos endpoints Brain (`/redemption-validate` + `/redemption-use`). Mientras tanto, la validación de expiry en POS es client-side pero funcional.

3. **Quiz cap timezone**: Usamos UTC para el cálculo de semana. Si la cafetería opera en CET/CEST, hay un offset de 1-2h en el corte de semana. Es aceptable para un cap de 300pts.

4. **Firestore indexes**: Las queries nuevas (orgId + uid + type + createdAt) pueden necesitar composite indexes en Firestore. Crear si hay errores en runtime.

---

## 8. Compatibilidad con App Standalone

- **CERO cambios en `apps/app`**
- **CERO imports de `@raiz/shared`** reintroducidos
- El frontend recibe campos adicionales opcionales (`cappedByWeekly`, `weeklyCapMessage`) que puede usar o ignorar
- Feature flag `NEXT_PUBLIC_USE_SERVER_LOYALTY` sigue funcionando
- Fallback legacy en quiz-service.ts no se tocó

---

## 9. Roadmap de Rollout

| PR | Riesgo | Rollout | Validación |
|----|--------|---------|------------|
| PR5 | Bajo | Deploy Brain → ejecutar backfill | Verificar que customers route devuelve solo datos de la org |
| PR6 | Muy bajo | Deploy Brain | Tests de idempotency ya pasan; no hay cambio de API |
| PR7 | Bajo | Deploy Brain → probar validate/use desde POS | Crear redemption, esperar expiry, verificar rechazo |
| PR8 | Medio | Deploy Brain → monitorizar quiz_cap_reached events | Completar >300pts de quizzes en una semana, verificar truncado |

Todos son independientes y se pueden desplegar en cualquier orden.
