# Auditoría de Código — apps/app & apps/brain

**Fecha:** 2026-03-23
**Archivos analizados:** ~90 archivos fuente (excluyendo node_modules)

---

## Resumen Ejecutivo

| Severidad | app | brain | Total |
|-----------|-----|-------|-------|
| CRITICAL  | 1   | 2     | **3** |
| HIGH      | 6   | 5     | **11**|
| MEDIUM    | 5   | 7     | **12**|
| LOW       | 3   | 5     | **8** |
| **Total** | **15** | **19** | **34** |

---

## FALLOS CRÍTICOS

### BRAIN-01 — Sin autenticación en rutas de Quizzes
- **Archivo:** `apps/brain/app/api/org/[orgId]/quizzes/route.ts`
- **Líneas:** 8-52 (GET y POST)
- **Categoría:** Seguridad
- **Descripción:** Los endpoints GET y POST de quizzes NO tienen verificación de autenticación. Cualquier usuario no autenticado puede leer/modificar quizzes de cualquier organización.
- **Fix:** Añadir `await requireOrgMember(req, orgId)` al inicio de ambos handlers.

### BRAIN-02 — Fuga de datos cross-org en Dashboard
- **Archivo:** `apps/brain/app/api/org/[orgId]/dashboard/route.ts`
- **Líneas:** 30-38
- **Categoría:** Seguridad — Aislamiento Multi-Tenant
- **Descripción:** Las queries de `tickets` y `orders` NO filtran por orgId. Un usuario de org A puede ver datos de ventas de TODAS las organizaciones.
- **Fix:** Agregar `.where("orgId", "==", orgId)` a ambas queries.

### APP-01 — Stripe API key sin validación de env vars
- **Archivo:** `apps/app/app/api/create-payment-intent/route.ts`
- **Línea:** 3
- **Categoría:** Runtime / Seguridad
- **Descripción:** Non-null assertion `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!` sin validar. Si falta la variable, crash en runtime.
- **Fix:** Validar existencia antes de usar.

---

## FALLOS HIGH

### APP-02 — Unsafe `as any` en múltiples archivos
- **Archivos:** `apps/app/app/page.tsx` (líneas 60, 71, 114, 152-153), `apps/app/app/checkout/page.tsx` (línea 269)
- **Categoría:** TypeScript / Seguridad de tipos
- **Descripción:** Uso de `as any` para bypassear el type system. Puede ocultar bugs en runtime.
- **Fix:** Extender las interfaces Product con los campos necesarios.

### APP-03 — Firebase init silenciosa en Webhook
- **Archivo:** `apps/app/app/api/webhook/route.ts`
- **Líneas:** 22-45
- **Categoría:** Error handling
- **Descripción:** Si `FIREBASE_SERVICE_ACCOUNT_JSON` es malformado, el parsing falla silenciosamente y los eventos del webhook se pierden.
- **Fix:** Throw error explícito si el parse falla.

### APP-04 — Race condition en Payment Intent
- **Archivo:** `apps/app/app/api/payments/create/route.ts`
- **Líneas:** 96-112
- **Categoría:** Concurrencia
- **Descripción:** PaymentIntent reutilizado puede transicionar a estado fallido entre el check y el uso.
- **Fix:** Usar idempotency keys de Stripe.

### APP-05 — Memory leak en Order Notifications
- **Archivo:** `apps/app/hooks/use-order-notifications.ts`
- **Línea:** 30
- **Categoría:** React / Memory leak
- **Descripción:** `notifyReady` falta en el array de dependencias del useEffect. Se crean listeners sin limpiar los anteriores.
- **Fix:** Agregar `notifyReady` al array de deps.

### APP-06 — Null reference en Orders page
- **Archivo:** `apps/app/app/orders/page.tsx`
- **Líneas:** 57-59
- **Categoría:** Runtime — Null/Undefined
- **Descripción:** `STATUS_STEPS.indexOf(data.status || "")` retorna -1 si status es undefined, causando errores lógicos.
- **Fix:** Validar status antes de buscar en array.

### APP-07 — Empty catch blocks en Payments
- **Archivo:** `apps/app/app/api/payments/create/route.ts`
- **Líneas:** 26, 109-111
- **Categoría:** Error handling
- **Descripción:** Catch vacíos que tragan errores silenciosamente.
- **Fix:** Verificar tipo de error antes de ignorar.

### BRAIN-03 — JSON.parse sin try-catch en firebase-admin
- **Archivo:** `apps/brain/lib/firebase-admin.ts`
- **Línea:** 35
- **Categoría:** Runtime Error
- **Descripción:** Si `FIREBASE_ADMIN_JSON` tiene JSON inválido, crash al cargar el módulo. La app entera no arranca.
- **Fix:** Wrap en try-catch con mensaje claro.

### BRAIN-04 — Idempotency key incorrecta en loyalty/adjust
- **Archivo:** `apps/brain/app/api/org/[orgId]/loyalty/adjust/route.ts`
- **Líneas:** 64, 69
- **Categoría:** Bug lógico
- **Descripción:** Dos requests idénticos dentro del mismo minuto generan la misma idempotency key, tratando el segundo como duplicado.
- **Fix:** Incluir componente random o timestamp en milisegundos.

### BRAIN-05 — Side effects silenciosos en loyalty-engine
- **Archivo:** `apps/brain/lib/loyalty-engine.ts`
- **Líneas:** 254-265, 452-459, 587-594
- **Categoría:** Error handling
- **Descripción:** Side effects de perfil fallan silenciosamente. Los puntos se otorgan pero el perfil no se actualiza.
- **Fix:** Retry mechanism o flag de reconciliación.

### BRAIN-06 — Unsafe `any` casting en customers
- **Archivo:** `apps/brain/app/api/org/[orgId]/customers/route.ts`
- **Línea:** 64
- **Categoría:** TypeScript
- **Descripción:** `(a: any, b: any)` en sort derrota el type system.
- **Fix:** Definir interface para customer.

---

## FALLOS MEDIUM

### APP-08 — Sin validación de longitud en campo Notes
- **Archivo:** `apps/app/app/checkout/CheckoutClient.tsx`
- **Líneas:** 65, 197-203
- **Categoría:** Validación de input
- **Descripción:** Sin límite de longitud ni sanitización del campo notas.
- **Fix:** Limitar a 500 chars client y server-side.

### APP-09 — Array index como React key
- **Archivo:** `apps/app/app/orders/page.tsx`
- **Línea:** 79
- **Categoría:** React
- **Descripción:** Usar `i` como key causa bugs de reconciliación si la lista se reordena.
- **Fix:** Usar `${it.productId}-${it.qty}` como key.

### APP-10 — Non-null assertion en orderData
- **Archivo:** `apps/app/app/checkout/page.tsx`
- **Línea:** 85
- **Categoría:** Type Safety
- **Descripción:** `orderSnap.data()!` sin verificar existencia.
- **Fix:** Verificar que data no sea null antes de usar.

### APP-11 — AudioContext sin error handling
- **Archivo:** `apps/app/hooks/use-order-notifications.ts`
- **Líneas:** 6-9
- **Categoría:** Error handling
- **Descripción:** AudioContext puede fallar en algunos navegadores.
- **Fix:** Wrap en try-catch.

### APP-12 — Lógica de time slots duplicada
- **Archivos:** `apps/app/lib/customer-profile-service.ts` (63-70), `apps/app/lib/data-enrichment.ts` (11-18)
- **Categoría:** Duplicación de código
- **Fix:** Mover a archivo compartido de constantes.

### BRAIN-07 — Missing OrgMember check en Suppliers GET
- **Archivo:** `apps/brain/app/api/org/[orgId]/suppliers/route.ts`
- **Línea:** 9
- **Categoría:** Seguridad
- **Descripción:** Usa `requireAuth` en vez de `requireOrgMember`. Un usuario de org A puede leer suppliers de org B.
- **Fix:** Cambiar a `requireOrgMember(req, orgId)`.

### BRAIN-08 — Missing OrgMember check en SKUs GET
- **Archivo:** `apps/brain/app/api/org/[orgId]/skus/route.ts`
- **Línea:** 13
- **Categoría:** Seguridad
- **Descripción:** Mismo patrón que BRAIN-07.
- **Fix:** Cambiar a `requireOrgMember(req, orgId)`.

### BRAIN-09 — Missing OrgMember check en Recipes GET
- **Archivo:** `apps/brain/app/api/org/[orgId]/recipes/route.ts`
- **Línea:** 14
- **Categoría:** Seguridad
- **Descripción:** Mismo patrón que BRAIN-07.
- **Fix:** Cambiar a `requireOrgMember(req, orgId)`.

### BRAIN-10 — computeLedgerBalance sin filtro por orgId
- **Archivo:** `apps/brain/lib/loyalty-engine.ts`
- **Líneas:** 27-55
- **Categoría:** Multi-Tenant
- **Descripción:** Queries de loyalty_transactions filtran solo por uid, sin orgId. Balance puede ser incorrecto si un uid existe en múltiples orgs.
- **Fix:** Agregar parámetro orgId y filtrar.

### BRAIN-11 — Race condition en badge unlocking
- **Archivo:** `apps/brain/lib/loyalty-engine.ts`
- **Líneas:** 1071-1137
- **Categoría:** Concurrencia
- **Descripción:** Dos requests simultáneos pueden leer el mismo estado de perfil y ambos intentar otorgar el mismo badge.
- **Fix:** Usar transacción o campo de flag.

### BRAIN-12 — Loose type checking en Dashboard
- **Archivo:** `apps/brain/app/api/org/[orgId]/dashboard/route.ts`
- **Líneas:** 44, 59, 61, 94-97
- **Categoría:** TypeScript
- **Descripción:** Múltiples `as Record<string, unknown>` sin interfaces explícitas.
- **Fix:** Definir interfaces para SKU, PosProduct, SaleItem.

---

## FALLOS LOW

### APP-13 — Console errors en producción
- **Archivos:** Múltiples
- **Descripción:** Logs sensibles (Firebase, Stripe errors) en producción. Usar Sentry o similar.

### APP-14 — tsconfig.json permisivo
- **Archivo:** `apps/app/tsconfig.json`
- **Descripción:** `skipLibCheck: true` oculta errores de tipos en dependencias.

### BRAIN-13 — Sin límite superior en parámetro `days`
- **Archivo:** `apps/brain/app/api/org/[orgId]/dashboard/route.ts`
- **Línea:** 20
- **Descripción:** Un user puede pedir `days=999999` y sobrecargar la DB.
- **Fix:** `Math.min(days, 365)`.

### BRAIN-14 — Fallback débil en supplier name
- **Archivo:** `apps/brain/app/api/org/[orgId]/suppliers/[supplierId]/route.ts`
- **Línea:** 21
- **Descripción:** `snap.data()?.name || ""` matchea items con supplier vacío.

### BRAIN-15 — Validación insuficiente en POST /quizzes
- **Archivo:** `apps/brain/app/api/org/[orgId]/quizzes/route.ts`
- **Líneas:** 29-31
- **Descripción:** No valida que `questions` sea array ni `points` sea número positivo.

---

## Prioridades de Remediación

### Inmediato (antes de producción)
1. **BRAIN-01** — Auth en quizzes (CRITICAL)
2. **BRAIN-02** — Fuga cross-org en dashboard (CRITICAL)
3. **APP-01** — Validación de env vars de Stripe (CRITICAL)
4. **BRAIN-03** — JSON.parse seguro en firebase-admin (HIGH)
5. **BRAIN-04** — Fix idempotency key (HIGH)

### Sprint actual
6. **BRAIN-07/08/09** — requireOrgMember en GET routes (MEDIUM-seguridad)
7. **APP-04** — Race condition en payments (HIGH)
8. **APP-05** — Memory leak en notifications (HIGH)
9. **BRAIN-10** — orgId en computeLedgerBalance (MEDIUM)

### Backlog
10. Los demás issues MEDIUM y LOW
