# Plan de Implementación — Raíz y Grano

**De ecosistema fragmentado a sistema unificado**
Fecha: 11 de marzo de 2026 — Basado en código real del repositorio

---

## Ajustes al documento de arquitectura

Tras analizar los modelos reales, hay tres cosas que el documento de arquitectura debe ajustar:

**1. Los tickets YA están bajo `orgs/{orgId}/tickets`.** Brain y POS ya comparten tenant. Esto es una victoria. Pero `products`, `categories`, `inventory`, `orders` (App), `teacher_orders`, `customer_profiles`, `redemptions` y `feedback` siguen en colecciones raíz (single-tenant). La migración a org-scoped no es para Fase 6 — hay que empezar antes, pero con adapters.

**2. Los tickets del POS ya tienen enrichment masivo** — clima, calendario académico, temporal, combos, tipo de cliente, frecuencia. Esto significa que la telemetría propuesta en Fase 3 ya existe parcialmente para ventas POS. Lo que falta es: (a) que los pedidos de App tengan el mismo enrichment, (b) que Brain consuma esos datos, y (c) que existan eventos formales, no solo campos en documentos.

**3. La propuesta de "Core como paquete npm" es correcta pero necesita ser más gradual.** Hoy `packages/shared` tiene 6 archivos. Saltar a 15 módulos de golpe es arriesgado. La ruta pragmática: expandir `@raiz/shared` incrementalmente, no crear un paquete `@raiz/core` nuevo hasta que haya masa crítica.

---

## Principio rector: Adapter First, Migrate Later

Para cada cambio propongo este patrón:

```
1. Crear tipo compartido en @raiz/shared
2. Crear adapter/service que lee de la colección actual
3. Las apps nuevas/refactorizadas usan el adapter
4. Cuando todas las apps usan el adapter, migrar la colección
5. El adapter absorbe el cambio → zero downtime
```

Esto evita migraciones big-bang y mantiene producción funcionando.

---

## HACER AHORA (Semanas 1-4)

### 1. Expandir @raiz/shared con tipos reales

**Por qué primero:** Todo lo demás depende de tipos compartidos. Hoy solo existen `AppOrder` y `OrderItem`. Cada app tiene sus propios tipos implícitos (objetos literales en Firestore writes). Unificar tipos no rompe nada — es aditivo.

**Qué hacer:**

```typescript
// packages/shared/types/product.ts
export type Product = {
  id: string
  name: string
  name_en?: string
  price: number
  category: string
  origin?: string
  available: boolean
  imageUrl?: string
  description?: string
  // Nuevos campos (opcionales para backwards compat)
  recipeId?: string        // Link a receta en Brain
  foodCostPct?: number     // Derivado de Brain
  modifiers?: string[]     // IDs de modifiers (futuro)
}

// packages/shared/types/order.ts
export type OrderSource = "APP" | "POS" | "TEACHER"
export type OrderStatus =
  | "CREATED" | "PAYMENT_PENDING" | "PAID"
  | "IN_QUEUE" | "PREPARING" | "READY"
  | "PICKED_UP" | "DELIVERED" | "CANCELED"
export type PaymentMethod = "CASH" | "CARD" | "STRIPE"
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED"

export type UnifiedOrder = {
  id: string
  source: OrderSource
  orgId: string

  // Cliente (opcional para POS anónimo)
  customerUid?: string
  customerName?: string
  customerEmail?: string
  customerSegment?: string

  // Items
  items: UnifiedOrderItem[]
  total: number
  notes?: string

  // Pickup
  pickupType?: "ASAP" | "SCHEDULED"
  pickupAt?: FirestoreTimestamp

  // Pago
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentId?: string          // Stripe ID

  // Estado
  status: OrderStatus

  // Staff
  staffId?: string
  staffName?: string

  // Teacher-specific
  deliveryType?: "classroom" | "pickup"
  classroom?: string
  teacherName?: string

  // Tiempos
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
  paidAt?: FirestoreTimestamp
  completedAt?: FirestoreTimestamp
  preparationTimeSecs?: number

  // Enrichment (ya existe en tickets POS)
  enrichment?: OrderEnrichment
}

export type UnifiedOrderItem = {
  productId: string
  productName: string
  unitPrice: number
  qty: number
  modifiers?: { name: string; priceDelta: number }[]
}

// packages/shared/types/customer.ts
export type CustomerSegment = "new" | "occasional" | "regular" | "loyal" | "churning"
export type CoffeeKnowledge = "novato" | "curioso" | "entendido" | "experto"

export type CustomerProfile = {
  id: string
  uid: string
  email?: string
  name?: string
  segment: CustomerSegment

  // Behavioral
  totalVisits: number
  totalSpent: number
  avgTicket: number
  lastVisit: FirestoreTimestamp

  // Loyalty
  granos: number
  totalGranosEarned: number
  level: string

  // Gamification
  completedMissions: string[]
  unlockedBadges: string[]
  completedQuizzes: string[]
  streak: StreakData
  coffeeKnowledge: CoffeeKnowledge

  // Preferences
  favoriteProducts: string[]
  coffeeProfileTraits: string[]
}

// packages/shared/types/inventory.ts
export type RawMaterial = {
  id: string
  name: string

  // Unidad y stock (del POS inventory)
  unit: string
  stock: number
  minStock: number

  // Coste (del Brain catalog)
  baseUnit: string
  packQty: number
  packCost: number
  unitCost: number
  supplier: string

  // Metadata
  category?: string
  notes?: string
  lastUpdated: FirestoreTimestamp
}

// packages/shared/types/recipe.ts
export type Recipe = {
  id: string
  name: string
  productId?: string       // Link a producto
  productName?: string
  yieldQty: number
  yieldUnit: string
  sellingPrice: number
  totalCost: number
  foodCostPct: number
  ingredients: RecipeIngredient[]
}

export type RecipeIngredient = {
  id: string
  catalogItemId: string
  name: string
  qty: number
  unit: string
  baseQty: number
  baseUnit: string
  unitCost: number
  lineCost: number
}

// packages/shared/types/reward.ts
export type Reward = {
  id: string
  name: string
  description: string
  emoji: string
  costInGranos: number
  category: "drinks" | "food" | "merch" | "experience"
  active: boolean
  // Nuevo: conectado a costes
  estimatedFoodCost?: number
  productId?: string
}

export type Redemption = {
  id: string
  uid: string
  rewardId: string
  rewardName: string
  pointsSpent: number
  code: string
  status: "pending" | "used" | "expired"
  createdAt: FirestoreTimestamp
  expiresAt: FirestoreTimestamp
  usedAt?: FirestoreTimestamp
}

// packages/shared/types/events.ts
export type EventType =
  | "order.created" | "order.paid" | "order.status_changed"
  | "order.ready" | "order.picked_up" | "order.canceled"
  | "loyalty.points_earned" | "loyalty.points_redeemed" | "loyalty.level_up"
  | "gamification.badge_unlocked" | "gamification.mission_completed"
  | "gamification.quiz_completed"
  | "catalog.availability_changed" | "pricing.price_changed"
  | "inventory.stock_low" | "inventory.stock_depleted"
  | "recipe.cost_changed" | "ingredient.cost_updated"
  | "customer.segment_changed" | "customer.churning_detected"
  | "shift.closed" | "waste.logged"

export type SystemEvent = {
  id: string
  type: EventType
  source: "APP" | "POS" | "BRAIN" | "SYSTEM"
  orgId: string
  timestamp: FirestoreTimestamp
  data: Record<string, unknown>
  actorId?: string
}

// packages/shared/types/staff.ts
export type StaffRole = "owner" | "admin" | "manager" | "barista"
export type StaffMember = {
  id: string
  uid: string
  name: string
  email: string
  role: StaffRole
  pin?: string
  active: boolean
  createdAt: FirestoreTimestamp
}

// packages/shared/index.ts — actualizado
export * from "./firebase"
export * from "./types/product"
export * from "./types/order"
export * from "./types/customer"
export * from "./types/inventory"
export * from "./types/recipe"
export * from "./types/reward"
export * from "./types/events"
export * from "./types/staff"
export * from "./weather-enrichment"
export { createCategoryResolver } from "./category-resolver"
```

**Esfuerzo:** 2-3 días.
**Riesgo:** Zero. Aditivo puro.
**Desbloquea:** Todo lo demás.

---

### 2. Catálogo de rewards dinámico (quick win alto impacto)

**Por qué ahora:** Hoy las 8 recompensas están hardcodeadas en `apps/app/lib/rewards-service.ts`. Moverlas a Firestore permite que Brain las gobierne sin deploy. Es un cambio pequeño con impacto operativo real.

**Qué hacer:**

```
Paso 1: Crear colección orgs/{orgId}/rewards_catalog/{rewardId}
        con los 8 rewards actuales como documentos

Paso 2: Script de seed que escribe los 8 rewards actuales

Paso 3: En rewards-service.ts de App:
        - Cambiar de constante hardcoded a fetch de Firestore
        - Fallback a constantes si fetch falla (graceful degradation)

Paso 4: En Brain, añadir sección RewardsSection:
        - CRUD de rewards
        - Toggle active/inactive
        - Cambiar coste en granos
        - Ver tasa de canje por reward
```

**Adapter pattern:**

```typescript
// packages/shared/services/rewards-catalog.ts
import { collection, getDocs, query, where } from "firebase/firestore"

const FALLBACK_REWARDS = [ /* los 8 actuales */ ]

export async function getActiveRewards(db: Firestore, orgId: string) {
  try {
    const ref = collection(db, `orgs/${orgId}/rewards_catalog`)
    const q = query(ref, where("active", "==", true))
    const snap = await getDocs(q)
    if (snap.empty) return FALLBACK_REWARDS
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    return FALLBACK_REWARDS
  }
}
```

**Esfuerzo:** 2 días.
**Riesgo:** Bajo. Fallback a hardcoded si falla.
**Desbloquea:** Brain gobierna economía de loyalty. Campañas estacionales de rewards.

---

### 3. Quizzes y misiones dinámicos (quick win alto impacto)

**Mismo patrón que rewards.** Hoy están en `apps/app/lib/gamification/constants.ts`.

**Qué hacer:**

```
Paso 1: Crear colecciones:
        orgs/{orgId}/quizzes/{quizId}
        orgs/{orgId}/missions/{missionId}
        orgs/{orgId}/badges/{badgeId}

Paso 2: Script de seed con contenido actual

Paso 3: En App:
        - quiz-service.ts lee de Firestore (fallback a constants)
        - use-gamification.ts lee misiones de Firestore

Paso 4: En Brain:
        - GamificationSection: CRUD de quizzes, misiones, badges
        - Crear misión vinculada a calendario académico
        - Activar/desactivar por temporada
```

**Por qué importa:** En una cafetería universitaria, el contenido de gamificación debería cambiar por semestre, por semana de exámenes, por café del mes. Hoy requiere deploy. Con esto, el manager lo cambia desde Brain.

**Esfuerzo:** 3 días.
**Riesgo:** Bajo.
**Desbloquea:** Misiones contextuales, quizzes rotativos, Brain como editor de gamificación.

---

### 4. Brain ve segmentación de clientes (quick win para Brain)

**Por qué ahora:** La segmentación ya se calcula en la App (new/occasional/regular/loyal/churning) y se guarda en `customer_profiles`. Brain simplemente no la lee. Es un dashboard nuevo con datos que ya existen.

**Qué hacer:**

```
Paso 1: En Brain, crear CustomersSection.tsx
        - Lee customer_profiles (colección raíz, accesible con staff claim)
        - Muestra distribución por segmento (pie chart)
        - Lista clientes churning (lastVisit > 15 días)
        - Top 10 clientes por gasto
        - Búsqueda por nombre/email

Paso 2: Añadir a sidebar de Brain como nueva sección

Paso 3: (Opcional) Crear alerta automática:
        si customer con segment=loyal cambia a churning → log evento
```

**Esfuerzo:** 2 días.
**Riesgo:** Zero. Solo lectura.
**Desbloquea:** Brain entiende clientes. Base para campañas futuras.

**Nota sobre Firestore rules:** `customer_profiles` ya permite lectura a staff (`isOwner(userId) || isStaff()`). Brain usa Firebase Auth con Google Sign-In, no custom claims de staff. Opciones: (a) añadir claim `staff: true` a usuarios de Brain, o (b) crear API route en Brain que use Admin SDK para leer (ya tiene `firebase-admin`). Opción (b) es más rápida y no requiere cambiar claims.

---

### 5. Pricing centralizado (desbloquea lo más importante)

**Por qué ahora:** Este es el cambio que más desbloquea. Hoy hay tres fuentes de precio: `products.price` (POS escribe, App lee), `skus.sellingPrice` (Brain), `recipes.sellingPrice` (Brain). La sync es manual con botón `sync-pos`.

**El adapter que resuelve el 80%:**

No necesitamos una colección nueva de pricing todavía. Lo que necesitamos es invertir el flujo: **Brain escribe el precio en `products.price` directamente**, en vez de mantener su propio `sellingPrice` y sincronizar manualmente.

```
Estado actual:
  POS escribe products.price → Brain lee → Brain tiene su propio sellingPrice
  Sync manual: POS → Brain

Estado objetivo:
  Brain escribe products.price → POS y App leen automáticamente
  Brain mantiene skus.sellingPrice como referencia interna
  Cuando Brain actualiza sellingPrice → actualiza products.price atómicamente
```

**Qué hacer:**

```typescript
// En Brain: api/org/[orgId]/pricing/update/route.ts
export async function POST(req: Request) {
  // 1. Brain actualiza sellingPrice en SKU
  // 2. Si SKU tiene posProductId → actualiza products/{posProductId}.price
  // 3. Log evento: pricing.price_changed
  // 4. Retorna confirmación

  const { skuId, newPrice } = await req.json()
  const sku = await getDoc(doc(db, `orgs/${orgId}/skus/${skuId}`))

  // Actualizar SKU
  await updateDoc(doc(db, `orgs/${orgId}/skus/${skuId}`), {
    sellingPrice: newPrice,
    updatedAt: serverTimestamp()
  })

  // Actualizar recipe si existe
  if (sku.data().recipeId) {
    await updateDoc(doc(db, `orgs/${orgId}/recipes/${sku.data().recipeId}`), {
      sellingPrice: newPrice,
      foodCostPct: (sku.data().totalCost / newPrice) * 100,
      updatedAt: serverTimestamp()
    })
  }

  // CLAVE: Actualizar producto en colección raíz
  if (sku.data().posProductId) {
    await updateDoc(doc(adminDb, `products/${sku.data().posProductId}`), {
      price: newPrice,
      updatedAt: serverTimestamp()
    })
  }

  // Log evento
  await addDoc(collection(adminDb, `orgs/${orgId}/events`), {
    type: "pricing.price_changed",
    source: "BRAIN",
    data: { skuId, productId: sku.data().posProductId, oldPrice, newPrice },
    timestamp: serverTimestamp()
  })
}
```

**Esfuerzo:** 2-3 días.
**Riesgo:** Medio. El POS ya no debería editar precios de productos vinculados a SKUs. Necesita UI guard en POS (mostrar "Precio gobernado por Brain" para productos con receta).
**Desbloquea:** Fuente única de precios. Brain sugiere precios → aplica → App y POS ven cambio inmediato. Elimina sync-pos manual.

---

## HACER PRONTO (Semanas 5-8)

### 6. Unificar inventario Brain + POS

**El problema real:** POS tiene `inventory` (stock operativo con movimientos). Brain tiene `orgs/{orgId}/catalog` (materias primas con costes). Son dos catálogos de ingredientes que no se hablan.

**La solución pragmática:** No migrar todo. Crear un adapter que Brain use para leer stock del POS, y que el POS use para leer costes de Brain.

```
Paso 1: En Brain, API route GET /api/org/[orgId]/inventory/unified
        - Lee orgs/{orgId}/catalog (costes, proveedores)
        - Lee inventory (stock, movements) — colección raíz
        - Mercea por nombre/proveedor (fuzzy match)
        - Retorna vista unificada: coste + stock + proveedor

Paso 2: En Brain dashboard, mostrar stock real junto a coste
        - "Leche entera: €0.015/ml | Stock: 45L | Min: 20L | ⚠️ Reponer en ~3 días"

Paso 3: Cuando Brain aplica factura (invoices/apply):
        - Si el item matchea con inventory item del POS → actualizar coste ahí también
        - Crear movement de tipo "ajuste_coste" en inventory_movements

Paso 4: (Futuro) Migrar ambos a orgs/{orgId}/raw_materials/{id}
        con campos de ambas colecciones
```

**Esfuerzo:** 5 días.
**Riesgo:** Medio. El merge por nombre puede fallar (POS: "Leche" vs Brain: "Leche entera Pascual"). Necesita UI de mapeo manual como fallback.
**Desbloquea:** Brain ve stock real. Alertas de reposición basadas en datos reales. Base para disponibilidad conectada.

---

### 7. Disponibilidad conectada a stock

**Depende de:** Inventario unificado (#6).

**Qué hacer:**

```
Paso 1: En Brain, calcular qué productos se pueden preparar
        - Para cada producto con receta:
          - Obtener ingredientes de la receta
          - Verificar stock de cada ingrediente
          - Si alguno está en 0 → producto no disponible
          - Si alguno está bajo mínimo → producto en riesgo

Paso 2: Crear campo derivado: products/{id}.stockStatus
        - "available" | "low_stock" | "out_of_stock"
        - Actualizar cuando cambia stock (trigger o polling)

Paso 3: En App:
        - Productos out_of_stock → grises con "Agotado"
        - Productos low_stock → badge "Últimas unidades"
        - Validar en checkout: si algún item cambió a out_of_stock → avisar

Paso 4: En POS:
        - Badge visual en productos con stock bajo
        - No bloquear venta (el barista sabe más que el sistema)
        - Pero mostrar warning
```

**Cloud Function recomendada para esto:**

```typescript
// functions/src/inventory-watcher.ts
// Trigger: onUpdate de inventory/{itemId}
// Lógica: si stock cambió → buscar recetas que usan ese item
//         → para cada producto afectado, recalcular stockStatus
//         → actualizar products/{productId}.stockStatus
```

Esta es la primera Cloud Function que recomiendo. El resto del sistema funciona con listeners client-side y API routes, pero la cascada inventario → recetas → disponibilidad necesita ser server-side para ser confiable.

**Esfuerzo:** 5 días (incluyendo Cloud Function).
**Riesgo:** Medio. La Cloud Function añade complejidad operativa. Alternativa: cron job cada 5 minutos que recalcula disponibilidad (más simple, menos reactivo).
**Desbloquea:** La App deja de vender productos que no se pueden preparar.

---

### 8. Event log básico

**Qué hacer:**

```
Paso 1: Colección orgs/{orgId}/events/{eventId}
        Schema: { type, source, data, timestamp, actorId }

Paso 2: Función helper en @raiz/shared:
        logEvent(db, orgId, event) → escribe en events collection

Paso 3: Instrumentar gradualmente:
        - Brain: pricing.price_changed (al cambiar precio)
        - Brain: recipe.cost_changed (al aplicar factura)
        - POS: order.created (al crear ticket) — ya tiene enrichment
        - App: order.created, loyalty.points_earned

Paso 4: En Brain, EventsTimeline component:
        - Muestra últimos N eventos
        - Filtro por tipo
        - Timeline visual del día
```

**No hacer ahora:** Event bus reactivo, Cloud Functions como listeners, pub/sub. Primero el log. Después la reactividad.

**Esfuerzo:** 3 días.
**Riesgo:** Bajo. Es un append-only log.
**Desbloquea:** Trazabilidad. Base para alertas. Auditoría de cambios.

---

### 9. Refactoring de Brain en secciones

**Por qué ahora (semana 5-6):** Las features nuevas de Brain (#4 Customers, rewards CRUD, quizzes CRUD, events timeline) necesitan sitio. Si seguimos metiendo todo en page.tsx se vuelve ingobernable.

**Qué hacer:**

```
Extraer de page.tsx:
  ├── sections/DashboardSection.tsx    ← Home con KPIs (ya parcial)
  ├── sections/ProductsSection.tsx     ← Tabla POS products con food cost
  ├── sections/SKUSection.tsx          ← SKU Master
  ├── sections/RecipesSection.tsx      ← Escandallos
  ├── sections/CatalogSection.tsx      ← Materias primas
  ├── sections/SuppliersSection.tsx    ← Proveedores + facturas
  ├── sections/InventorySection.tsx    ← NUEVO: stock unificado
  ├── sections/CustomersSection.tsx    ← NUEVO: segmentos
  ├── sections/GamificationSection.tsx ← NUEVO: rewards, quizzes, misiones
  ├── sections/PricingSection.tsx      ← NUEVO: gobierno de precios
  ├── sections/EventsSection.tsx       ← NUEVO: timeline de eventos
  └── sections/ConfigSection.tsx       ← Ya existe parcial

Patrón de cada sección:
  - Componente independiente
  - Recibe orgId y user como props
  - Fetch propio de datos (SWR o useEffect)
  - Estado local
  - Sin dependencia de estado global de page.tsx
```

**Esfuerzo:** 5-7 días (extracción mecánica + nuevas secciones).
**Riesgo:** Medio. Refactoring puro puede romper cosas sutiles. Testear cada sección tras extracción.
**Desbloquea:** Brain puede crecer sin dolor. Cada feature nueva es una sección nueva.

---

## HACER DESPUÉS (Semanas 9-16)

### 10. Pedidos unificados

**Por qué no antes:** Requiere tipos compartidos (#1), event log (#8), y testing. Es el cambio más grande porque toca las tres apps y producción tiene datos históricos.

**Estrategia de migración sin downtime:**

```
Fase A: Dual-write (2 semanas)
  - POS sigue escribiendo en orgs/{orgId}/tickets
  - POS TAMBIÉN escribe en orgs/{orgId}/orders (nuevo)
  - App sigue escribiendo en orders (raíz)
  - App TAMBIÉN escribe en orgs/{orgId}/orders
  - Teacher orders siguen en teacher_orders
  - Teacher TAMBIÉN escribe en orgs/{orgId}/orders

Fase B: Dual-read (1 semana)
  - Brain lee de orgs/{orgId}/orders (unificado)
  - POS lee pedidos App de orgs/{orgId}/orders
  - Verificar que datos coinciden entre colecciones legacy y nueva

Fase C: Cut-over (1 día)
  - Cambiar reads a orgs/{orgId}/orders
  - Dejar writes en ambas durante 1 semana más (safety net)
  - Verificar dashboards, analytics, enrichment

Fase D: Cleanup (1 semana)
  - Remover dual-write
  - Marcar colecciones legacy como deprecated
  - NO eliminar colecciones legacy (datos históricos)
```

**El adapter clave:**

```typescript
// packages/shared/services/order-adapter.ts
export function ticketToUnifiedOrder(ticket: Ticket, orgId: string): UnifiedOrder {
  return {
    id: ticket.id,
    source: "POS",
    orgId,
    customerName: ticket.selectedCustomerName || "Walk-in",
    customerUid: ticket.selectedCustomerId || undefined,
    items: ticket.items.map(i => ({
      productId: i.product.id,
      productName: i.product.name,
      unitPrice: i.product.price,
      qty: i.quantity,
    })),
    total: ticket.total,
    paymentMethod: ticket.paymentMethod === "CASH" ? "CASH" : "CARD",
    paymentStatus: "PAID",
    status: "PICKED_UP", // POS tickets are immediate
    staffId: ticket.userId,
    staffName: ticket.userName,
    enrichment: {
      dayOfWeek: ticket.dayOfWeek,
      hourOfDay: ticket.hourOfDay,
      timeSlot: ticket.timeSlot,
      weatherTemp: ticket.weatherTemp,
      weatherCondition: ticket.weatherCondition,
      academicPeriod: ticket.academicPeriod,
      isExamWeek: ticket.isExamWeek,
      hasCombo: ticket.hasCombo,
      // ... etc
    },
    createdAt: ticket.createdAt,
    updatedAt: ticket.createdAt,
  }
}

export function appOrderToUnifiedOrder(order: AppOrder, orgId: string): UnifiedOrder {
  return {
    id: order.id,
    source: "APP",
    orgId,
    customerUid: order.customerUid,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: (order.items || []).map(i => ({
      productId: i.productId,
      productName: i.productName,
      unitPrice: i.unitPrice,
      qty: i.qty,
    })),
    total: order.total || 0,
    paymentMethod: order.paymentId ? "STRIPE" : "CASH",
    paymentStatus: order.paymentStatus === "PAID" ? "PAID" : "PENDING",
    paymentId: order.paymentId,
    status: order.status || "CREATED",
    pickupType: order.pickupType,
    pickupAt: order.pickupAt,
    notes: order.notes || undefined,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    preparationTimeSecs: order.preparationTimeSecs,
  }
}
```

**Esfuerzo:** 3-4 semanas.
**Riesgo:** Alto. Datos de producción. Testing exhaustivo necesario.
**Desbloquea:** Analytics unificados. Brain ve TODAS las ventas en un solo query. Base para multi-sede.

---

### 11. Alertas proactivas en Brain

**Depende de:** Inventario unificado (#6), pricing centralizado (#5), event log (#8).

**Motor de alertas simple (sin ML, sin cron):**

```typescript
// En Brain dashboard, cada vez que carga:
async function generateAlerts(orgId: string): Promise<Alert[]> {
  const alerts: Alert[] = []

  // 1. Food cost alto
  const skus = await getSkus(orgId)
  for (const sku of skus) {
    if (sku.foodCostPct > config.foodCostThresholds.acceptable) {
      alerts.push({
        type: "high_food_cost",
        severity: "warning",
        message: `${sku.name}: food cost ${sku.foodCostPct.toFixed(1)}%`,
        suggestion: `Subir precio a €${(sku.totalCost / (config.foodCostThresholds.excellent / 100)).toFixed(2)} para volver a ${config.foodCostThresholds.excellent}%`,
        action: { type: "update_price", skuId: sku.id }
      })
    }
  }

  // 2. Stock bajo
  const inventory = await getUnifiedInventory(orgId)
  for (const item of inventory) {
    if (item.stock <= item.minStock && item.stock > 0) {
      alerts.push({
        type: "low_stock",
        severity: "warning",
        message: `${item.name}: ${item.stock} ${item.unit} (mín: ${item.minStock})`,
      })
    }
    if (item.stock <= 0) {
      alerts.push({
        type: "out_of_stock",
        severity: "critical",
        message: `${item.name}: SIN STOCK`,
      })
    }
  }

  // 3. Clientes churning
  const churning = await getChurningCustomers(orgId)
  if (churning.length > 0) {
    alerts.push({
      type: "churning_customers",
      severity: "info",
      message: `${churning.length} clientes loyal sin visitar en 15+ días`,
      action: { type: "view_customers", filter: "churning" }
    })
  }

  // 4. Margen comprimido
  const recentEvents = await getRecentEvents(orgId, "ingredient.cost_updated")
  // ... alertas sobre impacto en costes

  return alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])
}
```

**Esfuerzo:** 3-4 días.
**Riesgo:** Bajo. Solo lectura y cálculos.
**Desbloquea:** Brain pasa de dashboard pasivo a motor de decisión.

---

### 12. Producto estrella vs. lastre (clasificación automática)

**Depende de:** Pedidos unificados (#10) o al menos datos de tickets en Brain.

**Qué hacer:**

```typescript
// Clasificación BCG simplificada
type ProductQuadrant = "estrella" | "vaca" | "nicho" | "lastre"

function classifyProduct(
  sales: number,       // Unidades vendidas en periodo
  avgSales: number,    // Media de ventas de todos los productos
  margin: number,      // Margen en €
  avgMargin: number    // Media de margen de todos los productos
): ProductQuadrant {
  const highSales = sales >= avgSales
  const highMargin = margin >= avgMargin

  if (highSales && highMargin) return "estrella"   // Proteger
  if (highSales && !highMargin) return "vaca"      // Optimizar coste o precio
  if (!highSales && highMargin) return "nicho"     // Promocionar
  return "lastre"                                   // Reformular o descontinuar
}
```

**Dashboard:** Scatter plot con ventas (eje X) vs margen (eje Y). Cada producto es un punto. Cuadrantes marcados con color.

**Esfuerzo:** 2 días.
**Riesgo:** Bajo.
**Desbloquea:** Decisiones de menú basadas en datos.

---

## NO HACER TODAVÍA (Backlog priorizado)

Estas items son valiosas pero tienen dependencias fuertes o complejidad alta. Orden de prioridad:

| # | Mejora | Depende de | Esfuerzo | Cuándo |
|---|--------|-----------|----------|--------|
| 13 | Modifiers en catálogo (tamaños, leches) | Tipos compartidos, pricing centralizado | 3 semanas | Mes 4-5 |
| 14 | Order-ahead con estimación de cola | Pedidos unificados, POS queue size | 1 semana | Mes 4 |
| 15 | Campañas automáticas (win-back, boost) | Segmentación en Brain, quizzes dinámicos | 2 semanas | Mes 5 |
| 16 | Personalización de catálogo (coffee profile → sort) | Tipos compartidos, customers | 1 semana | Mes 4 |
| 17 | Combo builder con descuento | Pricing centralizado, modifiers | 2 semanas | Mes 5 |
| 18 | Cierre de caja estructurado en POS | Event log, pedidos unificados | 1 semana | Mes 4 |
| 19 | Waste tracking en POS | Event log, inventario unificado | 3 días | Mes 3-4 |
| 20 | QR de pedido para pickup | Pedidos unificados | 3 días | Mes 4 |
| 21 | Forecasting básico (promedios + contexto) | Pedidos unificados, enrichment | 2 semanas | Mes 6 |
| 22 | Multi-sede (locations model) | Todo lo anterior | 6-8 semanas | Mes 7+ |
| 23 | POS offline mode | Pedidos unificados | 2 semanas | Mes 5 |
| 24 | Notificaciones push contextuales | Campañas, event system | 1 semana | Mes 5-6 |

---

## Resumen ejecutivo de prioridades

```
SEMANA 1-2:  Tipos compartidos (#1) + Rewards dinámicos (#2)
SEMANA 3-4:  Quizzes dinámicos (#3) + Customers en Brain (#4) + Pricing centralizado (#5)
SEMANA 5-6:  Refactoring Brain (#9) + Inventario unificado (#6)
SEMANA 7-8:  Disponibilidad (#7) + Event log (#8)
SEMANA 9-12: Pedidos unificados (#10)
SEMANA 13+:  Alertas (#11) + Clasificación productos (#12) + Backlog
```

**Lo que desbloquea más con menos esfuerzo:**
1. Rewards dinámicos (2 días → Brain gobierna loyalty)
2. Pricing centralizado (3 días → elimina sync manual, fuente única)
3. Customers en Brain (2 días → Brain entiende clientes)

**Lo que tiene más riesgo:**
1. Pedidos unificados (migración de datos de producción)
2. Cloud Functions para disponibilidad (nueva infra)
3. Inventario unificado (merge de dos modelos distintos)

**Lo que NO recomiendo hacer:**
- No crear `packages/core` como paquete separado todavía. Expandir `@raiz/shared` hasta que tenga 15+ archivos, entonces evaluar split.
- No migrar colecciones raíz a org-scoped de golpe. Usar adapters.
- No implementar event bus reactivo (pub/sub, Cloud Functions como listeners). El event log append-only es suficiente por ahora.
- No intentar unificar staff (cafe_users + orgs/members) hasta que pedidos unificados esté resuelto. Es un cambio de auth que toca todo.
