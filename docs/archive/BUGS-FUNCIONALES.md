# Bugs Funcionales — Raíz y Grano

Auditoría: 24 marzo 2026

---

## CRÍTICOS (afectan dinero o datos)

### BUG 1 · El total del ticket POS ignora modificadores

**Archivo:** `apps/pos/src/lib/ticket-service.ts` línea 101

```ts
const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
```

El total que se guarda en Firestore solo multiplica `price × quantity` y no suma los `modifiers[].priceAdjustment`. Si un café de 3.50€ lleva leche de avena (+0.30€), el ticket se guarda como 3.50€ en vez de 3.80€.

**Consecuencia:** Los reportes de ventas muestran menos ingresos de los reales. Los puntos de lealtad se calculan sobre un total menor. El cuadre de caja no coincide.

**Fix:**
```ts
const total = items.reduce((sum, item) => {
  const modCost = (item.modifiers || []).reduce((s, m) => s + m.priceAdjustment, 0)
  return sum + (item.product.price + modCost) * item.quantity
}, 0)
```

---

### BUG 2 · Race condition en idempotencia del loyalty engine

**Archivo:** `apps/brain/lib/loyalty-engine.ts` líneas 99-104

```ts
const result = await adminDb.runTransaction(async (tx) => {
  // Esta query usa adminDb en vez de tx → no está dentro del aislamiento transaccional
  const existingQuery = await adminDb
    .collection("loyalty_transactions")
    .where("idempotencyKey", "==", idempotencyKey)
    .limit(1)
    .get()   // ← debería ser tx.get()
```

La comprobación de duplicados se ejecuta fuera del aislamiento de la transacción. Dos peticiones concurrentes pueden pasar la comprobación y ambas crear la transacción, duplicando puntos.

El mismo patrón se repite en `redeemRewardServer()` (líneas 709-714), lo que permite canjes dobles.

**Consecuencia:** Doble asignación de puntos o doble canje de recompensas bajo carga concurrente.

**Fix:** La query de idempotencia no se puede hacer con `tx` porque Firestore transactions no soportan queries arbitrarias con `where`. Hay que usar un documento con el idempotencyKey como ID y hacer `tx.get()` sobre ese documento concreto:
```ts
const idempRef = adminDb.doc(`loyalty_idempotency/${idempotencyKey}`)
const idempSnap = await tx.get(idempRef)
if (idempSnap.exists) { return { success: true, duplicate: true, ... } }
// Al final de la transacción:
tx.set(idempRef, { createdAt: new Date().toISOString() })
```

---

### BUG 3 · Endpoint economy filtra customer_profiles sin orgId

**Archivo:** `apps/brain/app/api/org/[orgId]/loyalty/economy/route.ts` líneas 122-125

```ts
const profileSnap = await adminDb
  .collection("customer_profiles")
  .where("loyaltyPoints", ">", 0)
  .get()   // ← sin filtrar por orgId
```

La estimación de breakage lee TODOS los customer_profiles de todos los orgs, no solo los del org solicitado.

**Consecuencia:** Los datos de economía de lealtad mezclan usuarios de distintas organizaciones. Métricas de breakage incorrectas.

**Fix:** Añadir `.where("orgId", "==", orgId)` a la query.

---

### BUG 4 · Reconciliación no atómica

**Archivo:** `apps/brain/app/api/org/[orgId]/loyalty/reconcile/route.ts` líneas ~167-199

La corrección de balance escribe la transacción de corrección y luego actualiza el perfil como dos operaciones separadas. Si el servidor falla entre ambas, el ledger y el balance quedan inconsistentes — exactamente lo que reconcile intenta arreglar.

**Fix:** Envolver ambas escrituras en un solo `adminDb.runTransaction()`.

---

## ALTOS (funcionalidad rota)

### BUG 5 · Puntos POS calculados sobre total sin modificadores

**Archivo:** `apps/pos/src/lib/ticket-service.ts` líneas 186-191

```ts
if (selectedCustomerId) {
  const points = calculatePoints(total)  // ← total sin modificadores (Bug 1)
  ...
}
```

Este es consecuencia directa del Bug 1. Los puntos de fidelidad del POS se calculan sobre el total incorrecto.

**Consecuencia:** Los clientes reciben menos puntos de los que les corresponden.

---

### BUG 6 · getCustomerType() nunca recibe isTeacher

**Archivo:** `apps/pos/src/lib/ticket-service.ts` línea 107

```ts
const customerType = getCustomerType("POS")
```

La función acepta `(source, isTeacher)` pero nunca se le pasa `customerRole`. Todos los tickets POS se clasifican como `"anonymous_pos"`.

**Consecuencia:** Los reportes de analytics no distinguen entre alumnos y profesores. No se puede analizar el consumo por segmento.

**Fix:**
```ts
const customerType = getCustomerType("POS", customerRole === "profesor")
```

---

### BUG 7 · Pedidos ASAP guardan pickupAt = null

**Archivo:** `apps/app/app/checkout/CheckoutClient.tsx` líneas 77-83

```ts
let pickupAt: Timestamp | null = null
if (pickupType === "SCHEDULED") {
  // solo se asigna para SCHEDULED
}
```

Los pedidos "Lo antes posible" guardan `pickupAt: null` en Firestore. Si el dashboard o el POS ordena pedidos por `pickupAt`, los ASAP quedan fuera o se posicionan mal.

**Fix:** Para ASAP, calcular un pickupAt estimado (+15 min):
```ts
if (pickupType === "ASAP") {
  const asap = new Date()
  asap.setMinutes(asap.getMinutes() + 15)
  pickupAt = Timestamp.fromDate(asap)
}
```

---

### BUG 8 · Race condition en número de ticket

**Archivo:** `apps/pos/src/lib/fiscal-service.ts` líneas ~44-76

```ts
await updateDoc(counterRef, { ticketNumber: increment(1) })
const updatedSnap = await getDoc(counterRef)  // ← lectura separada
return updatedSnap.data()?.ticketNumber || 1
```

El incremento es atómico, pero la lectura posterior no está dentro de la misma transacción. Con dos cajas cobrando a la vez, ambas pueden leer el mismo número.

**Consecuencia:** Dos tickets con el mismo número durante horas punta.

**Fix:** Usar `runTransaction()` para leer-incrementar-devolver atómicamente.

---

## MEDIOS (UX degradada)

### BUG 9 · Puntos de fidelidad POS fallan silenciosamente

**Archivo:** `apps/pos/src/lib/ticket-service.ts` líneas 189-190

```ts
awardPoints(selectedCustomerId, points, "POS", docRef.id, ...)
  .catch(err => console.error("[Loyalty] Error awarding POS points:", err))
```

Si el servicio de loyalty falla, el error solo va a console. El barista ve "Ticket generado" y cree que los puntos se asignaron.

**Consecuencia:** Puntos perdidos sin que nadie se entere. El cliente vuelve y no tiene los puntos.

---

### BUG 10 · Validación de hora de recogida tiene gap temporal

**Archivo:** `apps/app/app/checkout/CheckoutClient.tsx` líneas 64-70

```ts
const now = new Date()
const selectedDateTime = new Date()
selectedDateTime.setHours(hours, minutes, 0)
if (selectedDateTime < now) { ... }
```

La validación se ejecuta al pulsar "Confirmar", pero puede pasar tiempo entre que el usuario elige la hora y confirma. Si elige las 14:00 a las 13:58, a las 14:01 cuando finalmente pulsa confirmar, la hora ya pasó pero la validación se ejecutó antes.

Además, esta validación solo está en `CheckoutClient.tsx`, no en el flujo de Stripe (`checkout/page.tsx`).

---

### BUG 11 · Stats de productos se ejecutan en background sin garantía

**Archivo:** `apps/pos/src/lib/ticket-service.ts` líneas 181-183

```ts
updateProductDailyStats(items, enrichment.timeSlot, paymentMethod, "POS")
  .catch(err => console.error("Error updating product stats:", err))
```

Si el barista cierra la pestaña justo después de generar el ticket, las stats no se registran. El ticket existe pero las estadísticas de producto no.

**Consecuencia:** Dashboard de analytics con datos incompletos. "Vendimos 50 cafés pero stats muestran 47".
