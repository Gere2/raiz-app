# Gamificación V2 — Arquitectura de Sistema Robusto

**Raíz y Grano · Loyalty & Gamification Infrastructure**
**Fecha:** 2026-03-12
**Autor:** Staff Engineer / Systems Architect

---

## 1. Diagnóstico de Robustez (Fase Anterior)

### A. Vulnerabilidades Críticas Detectadas

| Vulnerabilidad | Severidad | Detalle |
|---|---|---|
| **Points awarded client-side** | CRÍTICA | `awardPoints()` en `loyalty-points-service.ts` ejecuta `increment()` directamente. Un usuario puede llamar a la Firestore REST API con `loyaltyPoints: 999999`. |
| **Firestore rules permiten write de loyalty fields** | CRÍTICA | `customer_profiles/{userId}` tenía `allow update: if isOwner(userId)` sin restricción de campos. |
| **Quiz completion sin validación server** | ALTA | `completeQuiz()` en `quiz-service.ts` otorga puntos client-side. Un usuario puede enviar cualquier quizId sin responder. |
| **Redemption no es atómica** | ALTA | `redeemReward()` hace `addDoc(redemptions)` + `setDoc(customer_profiles)` en dos writes separados. Race condition + posible estado inconsistente. |
| **Sin ledger de loyalty** | ALTA | Puntos son contadores (`loyaltyPoints`, `totalPointsEarned`) + un array creciente `pointsHistory` dentro del documento de perfil. No hay forma de auditar, revertir, o reconciliar. |
| **pointsHistory crece sin límite** | MEDIA | Array dentro del documento. Hit de 1MB document limit de Firestore inevitable con uso activo. |
| **Sin idempotencia en awarding** | MEDIA | Mismo `orderId` puede generar múltiples awards si se reintenta la petición. |
| **Sin targeting ni estados editoriales** | BAJA | Quizzes/missions/rewards solo tienen `enabled: boolean`. Sin draft/published/scheduled. |

### B. Qué DEBE moverse a server-side

- **Todo** lo que modifica `loyaltyPoints`, `totalPointsEarned`, `completedQuizzes`, `completedMissions`, `unlockedBadges`, `totalRedemptions`
- Validación de quiz completion (verificar respuestas contra quiz real)
- Validación de mission criteria (verificar progreso real del cliente)
- Creación de redemptions (código + débito atómico)
- Reversiones de puntos

### C. Qué puede seguir en frontend

- Lectura de catálogos (quizzes, missions, rewards)
- Lectura de balance y estado gamificación
- UI de quiz (preguntas, respuestas — pero submit va a server)
- Progreso visual de misiones
- Targeting evaluation (para filtrar qué mostrar — el server también valida)

### D. Qué es híbrido

- **Targeting evaluation**: se evalúa client-side para UX rápida, pero server valida antes de award/redeem
- **Badge detection**: server calcula y persiste, client solo muestra
- **Mission status**: client calcula progreso visual, server valida antes de completar

---

## 2. Loyalty Ledger — Diseño

### Entidad: `loyalty_transactions`

Colección root-level (no bajo orgs/) para queries eficientes.

```typescript
interface LoyaltyTransaction {
  id: string                    // auto-generated
  orgId: string                 // "raiz_y_grano"
  uid: string                   // customer uid
  type: LoyaltyTransactionType  // "earn.purchase" | "earn.quiz" | "redeem.reward" | ...
  amount: number                // SIGNED: +250 earn, -1500 redeem
  balanceAfter: number          // running balance post-transaction
  status: "completed" | "pending" | "reversed" | "failed"
  sourceType: LoyaltySourceType // "order" | "quiz" | "mission" | "redemption" | ...
  sourceId: string              // orderId, quizId, etc.
  idempotencyKey: string        // "{type}:{sourceId}:{uid}"
  description: string           // human-readable
  metadata: Record<string, any> // flexible context
  reversedByTxId?: string       // if reversed, link to reversal
  reversesOriginalTxId?: string // if this IS a reversal
  actorId: string               // who initiated
  createdAt: string             // ISO
  processedAt?: string          // ISO
}
```

### Decisiones de Diseño

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Saldo se guarda o se deriva? | **Se guarda como caché** en `customer_profiles.loyaltyPoints`, actualizado atómicamente en la misma transacción Firestore que crea el ledger entry | UI rápida sin scan del ledger |
| ¿Qué se cachea? | Balance actual + total earned + total redeemed en `customer_profiles` | Para reads instantáneos |
| ¿Qué se usa para UI rápida? | `customer_profiles.loyaltyPoints` (caché) | Single doc read |
| ¿Qué se usa para auditoría? | `loyalty_transactions` completo | Query por uid, tipo, fecha |
| ¿Cómo evitar doble asignación? | `idempotencyKey` unique check dentro de la transacción Firestore | Si ya existe tx con mismo key y status=completed, retorna sin crear |
| ¿balanceAfter cómo se calcula? | Dentro de la transacción: lee balance actual, suma amount, escribe ambos atómicamente | Consistencia fuerte |

---

## 3. Server-Side Operations

### Endpoints implementados

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/org/:orgId/loyalty/award` | POST | Bearer (user/staff) | Award purchase points |
| `/api/org/:orgId/loyalty/redeem` | POST | Bearer (user/staff) | Redeem reward |
| `/api/org/:orgId/loyalty/quiz-complete` | POST | Bearer (user) | Complete quiz + award |
| `/api/org/:orgId/loyalty/mission-complete` | POST | Bearer (user) | Complete mission + award |
| `/api/org/:orgId/loyalty/reverse` | POST | Bearer (staff only) | Reverse transaction |
| `/api/org/:orgId/loyalty/balance` | GET | Bearer (user/staff) | Get balance + history |

### Flujo: `completeQuizServer`

```
1. Verify auth (Bearer token → uid)
2. Fetch quiz from Firestore (orgs/{orgId}/quizzes/{quizId})
3. Validate: exists, enabled, not draft/archived
4. Validate: answers.length === questions.length
5. Score answers against correctIndex
6. Check: already completed? (for "once" cadence)
7. Create loyalty tx via createLoyaltyTx() — idempotent
   └─ Atomic: read balance → check idempotency → write tx + update balance
8. Mark quiz completed on customer_profiles
9. Record quiz_attempt (audit trail)
10. Check badges (best-effort, non-blocking)
11. Log event (fire-and-forget)
12. Return: { success, correctCount, totalQuestions, balanceAfter, newBadges }
```

### Flujo: `redeemRewardServer`

```
1. Verify auth
2. Fetch reward from Firestore
3. Validate: exists, enabled, not draft/archived
4. Generate 6-char redemption code
5. ATOMIC TRANSACTION:
   a. Check idempotency (per-minute window for same user+reward)
   b. Read current balance
   c. Verify balance >= pointsCost
   d. Create loyalty_transaction (amount = -pointsCost)
   e. Create redemption record (status = "pending", code, expiresAt)
   f. Update customer_profiles balance cache
6. Log event
7. Return: { success, code, redemptionId, balanceAfter }
```

### Flujo: `reverseTransaction`

```
1. Verify auth (staff only)
2. Read original transaction
3. Validate: exists, uid matches, not already reversed
4. Create reversal tx (negate amount) via createLoyaltyTx()
5. Mark original as status="reversed", reversedByTxId
6. Log event
```

---

## 4. Firestore Rules — Hardened

### Cambios clave:

1. **`isNotModifyingLoyaltyFields()`** — function que bloquea escritura client-side a campos económicos
2. **`loyalty_transactions`** — `allow write: if false` (solo Admin SDK)
3. **`quiz_attempts`** — `allow write: if false` (solo Admin SDK)
4. **`mission_completions`** — `allow write: if false` (solo Admin SDK)
5. **`redemptions`** — `allow create: if false` (solo Admin SDK, antes cualquier usuario podía crear)
6. **`customer_profiles`** — update ahora requiere `isNotModifyingLoyaltyFields()` para owner

Campos protegidos: `loyaltyPoints`, `totalPointsEarned`, `totalPointsRedeemed`, `unlockedBadges`, `completedMissions`, `completedQuizzes`, `totalRedemptions`, `pointsHistory`, `streak`, `lastTxId`, `lastTxAt`

---

## 5. Estados Editoriales

### Tipos implementados (en `types/editorial.ts`)

```typescript
type PublicationStatus = "draft" | "published" | "archived"

interface PublicationState {
  status: PublicationStatus
  activeFrom?: string | null    // ISO — visible from
  activeUntil?: string | null   // ISO — visible until
  targeting?: TargetingRule[]   // empty = everyone
  createdBy?: string
  updatedBy?: string
  publishedAt?: string | null
  archivedAt?: string | null
}
```

### Aplicación a entidades

Los campos de `PublicationState` se añaden opcionalmente a quizzes, missions y rewards. El patrón es aditivo — si no existen, el comportamiento actual (`enabled: true/false`) sigue funcionando.

### Evaluación

```typescript
// Server-side (en loyalty-engine antes de award):
if (quiz.status === "draft" || quiz.status === "archived") → reject
if (quiz.activeFrom && now < activeFrom) → reject
if (quiz.activeUntil && now > activeUntil) → reject

// Client-side (para filtrar catálogo visible):
filterEligible(quizzes, customerContext) → solo published + en ventana + targeting match
```

---

## 6. Targeting y Elegibilidad

### Shape

```typescript
interface TargetingRule {
  type: TargetingRuleType  // "segment" | "level" | "trait" | "new_user" | "date_range" | ...
  value: unknown           // shape depends on type
  negate?: boolean         // invert condition
}
```

### 14 tipos de targeting implementados

| Tipo | Value | Ejemplo |
|---|---|---|
| `segment` | CustomerSegment | `"loyal"` |
| `level` | LevelId | `"raiz"` |
| `trait` | CoffeeProfileTrait | `"explorador"` |
| `new_user` | number (días) | `30` (< 30 días desde registro) |
| `min_purchases` | number | `5` |
| `max_purchases` | number | `3` (< 3 compras = novato) |
| `date_range` | {from, to} | `{"from":"2026-03-10","to":"2026-03-17"}` |
| `day_of_week` | number[] | `[1,2,3,4,5]` (L-V) |
| `time_range` | {from, to} | `{"from":"08:00","to":"12:00"}` |
| `campaign` | string | `"exam-week-spring-2026"` |
| `academic_period` | string | `"exam-week"` |
| `has_badge` | string (badge ID) | `"coffee-scholar"` |
| `completed_quiz` | string (quiz ID) | `"welcome-profile"` |
| `completed_mission` | string (mission ID) | `"m-welcome"` |

### Lógica: múltiples reglas = AND. `negate: true` invierte.

### Evaluador: `targeting-evaluator.ts`

Pure function — sin dependencias de Firebase. Usable client y server.

```typescript
isEligible(entity, customerContext) → { eligible: boolean, failedRules? }
filterEligible(entities, customerContext) → T[]
```

### Ejemplos concretos soportados

- Quiz solo para nuevos usuarios: `[{ type: "new_user", value: 30 }]`
- Misión durante semana de exámenes: `[{ type: "campaign", value: "exam-week-spring-2026" }]`
- Reward solo para "loyal": `[{ type: "segment", value: "loyal" }]`
- Misión para exploradores: `[{ type: "trait", value: "explorador" }]`
- Reward L-V mañanas: `[{ type: "day_of_week", value: [1,2,3,4,5] }, { type: "time_range", value: { from: "08:00", to: "12:00" } }]`

---

## 7. Analytics de Gamificación

### Eventos raw (ya implementados en event model)

| Evento | Idempotencia | Side effects | Analytics |
|---|---|---|---|
| `gamification.quiz_viewed` | best-effort | — | impressions |
| `gamification.quiz_started` | best-effort | — | starts |
| `gamification.quiz_completed` | REQUIRED | badge check, mission check | completions, points |
| `gamification.mission_completed` | REQUIRED | badge check | completions, points |
| `gamification.badge_unlocked` | REQUIRED | — | unlocks |
| `rewards.redeemed` | REQUIRED | — | redemptions, points |
| `rewards.expired` | best-effort | — | breakage |
| `loyalty.points_earned` | REQUIRED | level check | earn tracking |
| `loyalty.points_reversed` | REQUIRED | — | reversal tracking |

### Snapshot diario: `GamificationAnalyticsSnapshot`

Almacena agregados diarios en `orgs/{orgId}/analytics_snapshots/{date}`. Campos incluyen: quiz stats, mission stats, reward stats, loyalty economy (earned/redeemed/reversed/in-circulation/estimated liability), engagement (active/new users).

### Métricas mínimas para Brain dashboard

1. **Economía de loyalty**: puntos en circulación, pasivo estimado, ratio earn/redeem
2. **Quiz performance**: completion rate, avg score, points granted
3. **Mission performance**: completion rate, points granted
4. **Reward performance**: redemption rate, breakage, top rewards
5. **Engagement**: daily active users, new users, churning

---

## 8. Event Model Completo

### Eventos por categoría

**Loyalty (ledger-backed, requieren idempotencia):**
- `loyalty.points_earned` — data: { uid, amount, type, sourceId, balanceAfter }
- `loyalty.points_redeemed` — data: { uid, amount, rewardId, code, balanceAfter }
- `loyalty.points_reversed` — data: { uid, amount, originalTxId, reason }
- `loyalty.balance_corrected` — data: { uid, oldBalance, newBalance, reason }
- `loyalty.level_up` — data: { uid, fromLevel, toLevel, totalGranos }

**Gamificación (best-effort analytics):**
- `gamification.quiz_viewed` — data: { uid, quizId }
- `gamification.quiz_started` — data: { uid, quizId }
- `gamification.quiz_completed` — data: { uid, quizId, score, points }
- `gamification.mission_viewed` — data: { uid, missionId }
- `gamification.mission_completed` — data: { uid, missionId, reward }
- `gamification.badge_unlocked` — data: { uid, badgeId, bonus }
- `gamification.streak_milestone` — data: { uid, weeks, bonus }

**Rewards (lifecycle, idempotencia en redeem/reverse):**
- `rewards.viewed` — data: { uid, rewardId }
- `rewards.redeem_requested` — data: { uid, rewardId, pointsCost }
- `rewards.redeemed` — data: { uid, rewardId, code, pointsCost, redemptionId }
- `rewards.used` — data: { redemptionId, staffId }
- `rewards.expired` — data: { redemptionId }
- `rewards.reversed` — data: { redemptionId, reason, refundTxId }

---

## 9. Plan de Tests

### Prioridad 1 — Atomicidad económica

| Test | Tipo | Qué valida |
|---|---|---|
| No doble award por quiz | Integration | Llamar `completeQuizServer` 2x con mismo quizId → segunda es no-op |
| No doble award por pedido | Integration | Llamar `awardPurchasePoints` 2x con mismo orderId → idempotente |
| No doble redeem en misma ventana | Integration | Llamar `redeemRewardServer` 2x rápido → segunda falla |
| Redemption atómica | Integration | Balance insuficiente → no se crea redemption NI se restan puntos |
| Balance nunca negativo | Unit | `createLoyaltyTx` con amount que cause negative → falla |
| Reversión correcta | Integration | Award → reverse → balance vuelve a original |

### Prioridad 2 — Validación server-side

| Test | Tipo | Qué valida |
|---|---|---|
| Quiz disabled → no award | Integration | Quiz con `enabled: false` → reject |
| Quiz draft → no award | Integration | Quiz con `status: "draft"` → reject |
| Mission criteria no cumplida → reject | Integration | Llamar `completeMissionServer` sin cumplir → error |
| Reward not found → reject | Integration | rewardId inexistente → 404 |

### Prioridad 3 — Targeting

| Test | Tipo | Qué valida |
|---|---|---|
| Segment targeting | Unit | `isEligible` con targeting `segment: "loyal"` + ctx con `segment: "new"` → false |
| Date range | Unit | Entidad con activeUntil en el pasado → not eligible |
| Negate rule | Unit | `negate: true` invierte resultado |
| Empty targeting = everyone | Unit | Sin targeting rules → eligible |

### Prioridad 4 — Firestore rules

| Test | Tipo | Qué valida |
|---|---|---|
| Client cannot write loyaltyPoints | Security | Update `customer_profiles` con `loyaltyPoints` → denied |
| Client cannot create redemption | Security | Create en `redemptions` → denied |
| Client cannot write loyalty_transactions | Security | Write en `loyalty_transactions` → denied |

---

## 10. Estrategia de Migración Incremental

### Fase 1 — Dual write (ACTUAL)
- Server-side endpoints están listos
- App SIGUE usando client-side awarding (backwards compat)
- Firestore rules hardened PERO con feature flag mental: deployer activa cuando App migra

### Fase 2 — App migra a server endpoints
- `completeQuiz()` en App → llama a `/api/org/.../loyalty/quiz-complete` en vez de escribir directamente
- `redeemReward()` en App → llama a `/api/org/.../loyalty/redeem`
- `awardPoints()` en App → llama a `/api/org/.../loyalty/award`
- Fallback: si server falla, NO caer al client-side (fail visible mejor que corrupción silenciosa)

### Fase 3 — Activar Firestore rules restrictivas
- Una vez App no escribe directamente, activar las rules que bloquean client writes
- NOTA: Las rules ya están escritas en este PR. Solo falta que App deje de necesitar write directo.

### Fase 4 — Backfill histórico
- Script que lee `pointsHistory` de customer_profiles y crea loyalty_transactions retroactivas
- Solo para auditoría, no cambia balances actuales
- Marca transactions como `status: "completed"`, `metadata.backfill: true`

### Feature flags recomendados

| Flag | Default | Propósito |
|---|---|---|
| `USE_SERVER_LOYALTY` | `false` | App usa server endpoints para award/redeem |
| `ENFORCE_STRICT_RULES` | `false` | Firestore rules bloquean client loyalty writes |
| `ENABLE_EDITORIAL_STATUS` | `false` | Brain UI muestra draft/published/archived |
| `ENABLE_TARGETING` | `false` | App evalúa targeting rules en catálogos |

---

## 11. Nuevas Colecciones y Estructura

### Colecciones nuevas

| Colección | Scope | Escritor | Lector |
|---|---|---|---|
| `loyalty_transactions` | Root | Admin SDK only | User (own) + Staff |
| `quiz_attempts` | Root | Admin SDK only | User (own) + Staff |
| `mission_completions` | Root | Admin SDK only | User (own) + Staff |
| `orgs/{orgId}/analytics_snapshots` | Org-scoped | Admin SDK | Org members |

### Colecciones modificadas

| Colección | Cambio |
|---|---|
| `customer_profiles` | Campos loyalty ahora protegidos por Firestore rules |
| `redemptions` | Client ya no puede crear (solo Admin SDK) |
| `orgs/{orgId}/quizzes` | Nuevos campos opcionales: `status`, `activeFrom`, `activeUntil`, `targeting`, `createdBy`, `updatedBy`, `publishedAt` |
| `orgs/{orgId}/missions` | Mismos campos opcionales |
| `orgs/{orgId}/rewards_catalog` | Mismos campos opcionales |

### Árbol de carpetas (nuevo/modificado)

```
packages/shared/
  types/
    loyalty.ts          ← NEW: LoyaltyTransaction, QuizAttempt, MissionCompletion, etc.
    editorial.ts        ← NEW: PublicationState, TargetingRule, CustomerContext, Analytics
    events.ts           ← MODIFIED: 15 new event types
  services/
    targeting-evaluator.ts  ← NEW: isEligible(), filterEligible()

apps/brain/
  lib/
    api-auth.ts         ← NEW: verifyAuth(), requireAuth()
    loyalty-engine.ts   ← NEW: createLoyaltyTx(), awardPurchasePoints(), completeQuizServer(),
                              completeMissionServer(), redeemRewardServer(), reverseTransaction()
  app/api/org/[orgId]/loyalty/
    award/route.ts      ← NEW
    redeem/route.ts     ← NEW
    quiz-complete/route.ts  ← NEW
    mission-complete/route.ts ← NEW
    reverse/route.ts    ← NEW
    balance/route.ts    ← NEW

firestore.rules         ← MODIFIED: loyalty field guard, server-only collections
firestore.indexes.json  ← MODIFIED: indexes for loyalty_transactions, quiz_attempts
```

---

## 12. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| App sigue escribiendo client-side durante migración | Alta | Medio | Feature flag `USE_SERVER_LOYALTY`. Migración gradual por operación. |
| Firestore rules rompen App actual | Media | Alto | Rules están escritas pero NO activadas para loyalty fields hasta que App migre. El `isNotModifyingLoyaltyFields()` solo afecta si App intenta escribir esos campos. |
| Race condition en idempotency check | Baja | Medio | `runTransaction()` de Firestore proporciona isolation. El check está dentro de la transacción. |
| Latencia de server roundtrip | Media | Bajo | Quiz scoring se hace server-side pero UX puede mostrar resultado optimista y confirmar async. |
| Backfill histórico incompleto | Baja | Bajo | Backfill es solo para auditoría. Balances actuales no cambian. |

---

## 13. Mejoras Proactivas Detectadas

1. **Expiración de puntos**: El ledger ya soporta `type: "expire"`. Implementar un cron que expire puntos no usados tras N meses. El campo `metadata.expiresAt` se puede añadir a earn transactions.

2. **Rate limiting en quiz completion**: Añadir `MAX_WEEKLY_QUIZ_POINTS` check server-side. Si un usuario intenta ganar > 300 pts/semana de quizzes, el server rechaza.

3. **Reconciliación automática**: Un script que compara `sum(loyalty_transactions.amount where uid=X and status=completed)` vs `customer_profiles.loyaltyPoints`. Si hay drift, crea una `correction` transaction.

4. **Webhook para POS**: Cuando una redemption se marca como "used" en POS, disparar evento `rewards.used` para analytics.

5. **Límite de redemptions activas**: No permitir más de N redemptions pendientes simultáneas por usuario. Previene acumulación infinita de códigos no usados.

6. **Estimación de pasivo**: Con el ledger, se puede calcular `sum(balanceAfter de último tx por uid) * ratio_euro_por_punto` para estimar el pasivo económico total del programa de fidelidad. Crítico para negocio.

7. **Campaña como entidad**: En el futuro, crear `orgs/{orgId}/campaigns` como entidad independiente con: nombre, periodo, targeting, multiplicador de puntos, rewards asociadas. Las targeting rules ya soportan `type: "campaign"`.
