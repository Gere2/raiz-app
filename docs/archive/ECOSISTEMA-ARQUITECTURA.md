# Raíz y Grano — Arquitectura de Ecosistema Unificado

**Documento de análisis, diagnóstico y propuesta arquitectónica**
Fecha: 11 de marzo de 2026
Versión: 1.0

---

## 1. Diagnóstico Ejecutivo

Raíz y Grano tiene un ecosistema digital sorprendentemente maduro para una cafetería universitaria. Tres apps en un monorepo (Next.js + Firebase + Stripe), con gamificación real, enriquecimiento de datos contextual (clima, calendario académico), escandallos vivos con extracción de facturas por IA, y un POS multicanal con loyalty integrado. Esto no es un MVP — es una plataforma con ambición seria.

Dicho esto, el ecosistema tiene **cinco tensiones estructurales** que impiden que funcione como un sistema unificado:

**Tensión 1 — Catálogo fragmentado.** Los productos se definen en la colección raíz `products` (POS los escribe, App los lee), pero Brain mantiene su propio universo bajo `orgs/raiz_y_grano/skus` y `orgs/raiz_y_grano/recipes`. La conexión entre ambos mundos es un `posProductId` opcional en los SKUs de Brain, con sincronización manual vía `POST /sync-pos`. No hay fuente única de verdad para "qué es un producto de Raíz y Grano".

**Tensión 2 — Precios con dos fuentes.** El POS define precios en `products.price`. Brain tiene `skus.sellingPrice` y `recipes.sellingPrice`. La sincronización es manual y unidireccional (POS → Brain). Si alguien cambia un precio en Brain, no baja al POS ni a la App. Esto es una bomba de relojería para los márgenes.

**Tensión 3 — Inventario desconectado de recetas.** El POS tiene su propio módulo de inventario (`inventory`, `inventory_movements`) que rastrea materias primas con stock y umbrales. Brain tiene `catalog` (materias primas con costes). Son dos catálogos de ingredientes paralelos que no se hablan. Un cambio de coste en una factura (Brain) no se refleja en el inventario operativo (POS), y el consumo real (POS) no alimenta el stock teórico (Brain).

**Tensión 4 — Gamificación aislada del negocio.** La App tiene un sistema de gamificación completo (granos, niveles, badges, misiones, quizzes, streaks, rewards). Pero esta lógica vive exclusivamente en el cliente. Brain no sabe nada de loyalty. No hay segmentación que alimente campañas. No hay datos de gamificación en los dashboards de Brain. Las recompensas no impactan en el análisis de márgenes.

**Tensión 5 — Brain es repositorio, no motor.** Brain calcula food cost y márgenes, pero no toma decisiones. No genera alertas proactivas, no sugiere pricing, no detecta anomalías, no segmenta clientes, no propone campañas. Es un dashboard estático con mucho potencial dormido.

**Lo que funciona bien:** el enriquecimiento contextual de cada transacción (clima, calendario, combos) es excelente y diferencial. El sistema de gamificación de la App es completo y bien diseñado. La extracción de facturas por IA es un acelerador real. El monorepo con `packages/shared` es la decisión correcta. Las reglas de Firestore con roles son sólidas.

---

## 2. Mapa de Responsabilidades

### Estado actual vs. estado objetivo

#### APP — Relación con el cliente

| Responsabilidad | Hoy | Objetivo |
|---|---|---|
| Catálogo / menú | Lee de `products` (raíz) | Lee de Core Catalog (filtrado por disponibilidad) |
| Pedidos | Escribe en `orders` | Escribe en Core Orders (con validación de stock) |
| Pagos | Stripe directo | Stripe via Core Payments |
| Gamificación | Motor local completo | Motor en Core Loyalty (App = UI) |
| Quizzes | Definidos en código | Definidos en Core Gamification (Brain los gestiona) |
| Rewards | Catálogo hardcodeado | Catálogo dinámico desde Core Rewards |
| Perfil cliente | Escribe en `customer_profiles` | Lee/escribe en Core Customers |
| Stock/disponibilidad | No validado | Valida contra Core Inventory en tiempo real |
| Recomendaciones | No existe | Consume recomendaciones de Core Analytics |
| Notificaciones | Browser push básico | Push contextual desde Core Events |

#### POS — Ejecución operativa

| Responsabilidad | Hoy | Objetivo |
|---|---|---|
| Catálogo / productos | CRUD en `products` | Lee de Core Catalog (Brain define, POS consume) |
| Toma de pedidos | Escribe en `tickets` | Escribe en Core Orders (tipo POS) |
| Cobro | Cash/Card manual | Cash/Card con trazabilidad en Core Payments |
| Estado de pedidos App | Lee `orders`, avanza status | Lee/escribe status en Core Orders |
| Pedidos profesor | Colección separada | Tipo de pedido en Core Orders |
| Inventario | Módulo propio (`inventory`) | Lee de Core Inventory (Brain gobierna) |
| Loyalty en mostrador | Lookup por QR/código, canjeo | Mismo, pero conectado a Core Loyalty |
| Analytics | `insights-service` propio | Lee dashboards de Core Analytics |
| Clasificación cliente | Modal de frecuencia/rol | Lectura de Core Customers (segmento real) |
| Alertas operativas | No hay | Core Events → alertas de stock, picos, etc. |

#### BRAIN — Inteligencia y gobierno

| Responsabilidad | Hoy | Objetivo |
|---|---|---|
| Catálogo maestro | SKUs bajo `orgs/` | Source of truth en Core Catalog |
| Recetas / escandallos | Bajo `orgs/recipes` | Core Recipes (conectado a catálogo y ventas) |
| Materias primas | Bajo `orgs/catalog` | Core Inventory (unificado con POS) |
| Precios | `sellingPrice` en SKU/recipe | Core Pricing (fuente única, baja a POS y App) |
| Facturas IA | Extracción + apply | Mismo, alimentando Core Inventory |
| Proveedores | Bajo `orgs/suppliers` | Core Suppliers |
| Packaging | Bajo `orgs/packaging` | Core Packaging |
| Dashboard | KPIs + profitability | Core Analytics (con loyalty, segmentos, campañas) |
| Alertas | Mínimas (food cost alto) | Motor de alertas proactivo |
| Segmentación | No existe | Core Customers (lee segmentos, define reglas) |
| Campañas | No existe | Core Campaigns (propone, ejecuta, mide) |
| Forecasting | No existe | Core Analytics (predicción de demanda) |

#### CORE ("Raíz Core") — Núcleo compartido

Hoy `packages/shared` tiene: tipos de `AppOrder`, Firebase init, weather enrichment, category resolver. Son ~4 archivos. Debe evolucionar a un verdadero dominio compartido.

| Módulo Core | Responsabilidad |
|---|---|
| `core/catalog` | Productos, variantes, modifiers, categorías, imágenes, disponibilidad |
| `core/orders` | Pedidos unificados (App, POS, Profesor), estados, historial |
| `core/customers` | Perfiles, segmentación, preferencias, historial |
| `core/loyalty` | Granos, niveles, streaks, transacciones de puntos |
| `core/gamification` | Badges, misiones, quizzes, coffee profile |
| `core/rewards` | Catálogo de recompensas, canjes, validación |
| `core/recipes` | Recetas, ingredientes, costes, food cost |
| `core/inventory` | Stock, movimientos, umbrales, alertas |
| `core/pricing` | Precios base, reglas, overrides por location |
| `core/suppliers` | Proveedores, facturas, historial de costes |
| `core/payments` | Stripe, métodos, trazabilidad |
| `core/events` | Bus de eventos, schemas, listeners |
| `core/analytics` | Métricas, enrichment, dashboards, recomendaciones |
| `core/permissions` | Roles, org membership, claims |
| `core/locations` | Sedes, configuración por ubicación, zonas horarias |

---

## 3. Fuentes de Verdad

### Tabla definitiva: quién es source of truth de cada entidad

| Entidad | Source of Truth | Hoy | Problema |
|---|---|---|---|
| **Productos** | Core Catalog (Brain define) | `products` (POS), `skus` (Brain) | Dos fuentes paralelas |
| **Variantes** | Core Catalog | No existe | Sin soporte de variantes (tamaños, leches) |
| **Modifiers** | Core Catalog | No existe | Sin soporte de modificadores |
| **Precios** | Core Pricing (Brain gobierna) | `products.price` (POS), `skus.sellingPrice` (Brain) | Dos fuentes, sync manual |
| **Recetas** | Core Recipes (Brain) | `orgs/recipes` (Brain) | Correcto, pero desconectado de ventas |
| **Ingredientes** | Core Inventory (Brain) | `orgs/catalog` (Brain) + `inventory` (POS) | Duplicado |
| **Costes unitarios** | Core Inventory (Brain) | `orgs/catalog.unitCost` (Brain) | Correcto |
| **Stock operativo** | Core Inventory (POS reporta, Brain gobierna) | `inventory` (POS) solo | Brain no ve stock real |
| **Pedidos** | Core Orders | `orders` (App), `tickets` (POS), `teacher_orders` (POS) | Tres colecciones separadas |
| **Pagos** | Core Payments | Stripe (App), implícito en ticket (POS) | Sin trazabilidad unificada |
| **Recompensas (catálogo)** | Core Rewards (Brain define) | Hardcodeado en App | No gobernable |
| **Recompensas (canjes)** | Core Rewards | `redemptions` | Correcto |
| **Loyalty (puntos)** | Core Loyalty | `customer_profiles.loyaltyPoints` | Correcto pero acoplado |
| **Usuarios cliente** | Core Customers | `customer_profiles` + `users` | Dos colecciones, sin merge limpio |
| **Usuarios internos** | Core Permissions | `cafe_users` + `staff` + `users` (POS) + `orgs/members` (Brain) | Cuatro sitios distintos |
| **Quizzes** | Core Gamification (Brain define) | Hardcodeados en App (`quiz-service.ts`) | No gobernable |
| **Misiones** | Core Gamification (Brain define) | Hardcodeadas en App (`constants.ts`) | No gobernable |
| **Badges** | Core Gamification (Brain define) | Hardcodeados en App (`constants.ts`) | No gobernable |
| **Segmentación** | Core Customers | `customer-profile-service` (App calcula) | Solo App calcula, Brain no sabe |
| **Proveedores** | Core Suppliers (Brain) | `orgs/suppliers` | Correcto |
| **Localizaciones** | Core Locations | `orgs/settings/config` (Brain) | Correcto pero limitado a una sede |
| **Reglas de disponibilidad** | Core Catalog | `products.available` (toggle manual en POS) | Sin conexión a stock ni horarios |
| **Categorías** | Core Catalog | `categories` (raíz) | Correcto pero sin jerarquía |
| **Packaging** | Core Packaging (Brain) | `orgs/packaging` | Correcto |
| **Feedback** | Core Customers | `feedback` (raíz) | Correcto pero desconectado de perfil |

### MEJORA DETECTADA: Unificación de usuarios internos

- **PROBLEMA ACTUAL:** Hay cuatro colecciones para staff: `cafe_users` (POS login), `staff` (POS admin), `users` (fallback), `orgs/members` (Brain). No es claro quién es la fuente de verdad de "quién trabaja aquí".
- **POR QUÉ IMPORTA:** Riesgo de inconsistencia de permisos, imposibilidad de auditar accesos, y fricción al onboardear empleados.
- **SOLUCIÓN PROPUESTA:** Unificar en `orgs/{orgId}/staff/{uid}` con roles (`owner`, `admin`, `barista`, `manager`). Custom claims de Firebase derivados de este documento. Eliminar `cafe_users` y `staff` como colecciones separadas.
- **IMPACTO:** POS usa nueva colección para auth. Brain usa misma colección para membership. App no afectada.
- **PRIORIDAD:** Alta.

### MEJORA DETECTADA: Catálogo de recompensas dinámico

- **PROBLEMA ACTUAL:** Las 8 recompensas están hardcodeadas en `rewards-service.ts` de la App. Para cambiar una recompensa hay que tocar código y redesplegar.
- **POR QUÉ IMPORTA:** Imposible hacer campañas estacionales, A/B testing de rewards, o ajustar la economía de puntos sin deploy.
- **SOLUCIÓN PROPUESTA:** Colección `rewards_catalog` en Firestore, gestionada desde Brain. La App lee el catálogo dinámicamente. Brain puede activar/desactivar rewards, cambiar costes en granos, añadir rewards temporales.
- **IMPACTO:** App lee catálogo dinámico. Brain gobierna economía de rewards. POS sin cambios.
- **PRIORIDAD:** Alta.

### MEJORA DETECTADA: Quizzes y misiones dinámicos

- **PROBLEMA ACTUAL:** Los 3 módulos de quizzes y las 9 misiones están hardcodeados en constantes de la App. No se pueden cambiar sin deploy.
- **POR QUÉ IMPORTA:** Para una cafetería universitaria, las misiones y quizzes deberían cambiar por semestre, por temporada de exámenes, por café del mes. Hoy es imposible sin intervención técnica.
- **SOLUCIÓN PROPUESTA:** Colecciones `quizzes` y `missions` en Firestore bajo la org. Brain como editor. La App consume dinámicamente.
- **IMPACTO:** App consume contenido dinámico. Brain tiene un editor de gamificación. Operaciones puede cambiar misiones sin código.
- **PRIORIDAD:** Media-alta.

---

## 4. Arquitectura Objetivo

### Visión: Raíz Core como capa de dominio compartida

```
┌─────────────────────────────────────────────────────────┐
│                    RAÍZ CORE                            │
│  (packages/shared → packages/core)                      │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Catalog  │ │ Orders   │ │Customers │ │ Loyalty   │  │
│  │          │ │          │ │          │ │ & Rewards │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Recipes  │ │Inventory │ │ Pricing  │ │Gamtic.    │  │
│  │          │ │          │ │          │ │           │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Suppliers │ │ Events   │ │Analytics │ │Permissions│  │
│  │          │ │          │ │          │ │& Locations│  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│                                                         │
│  Types · DTOs · Event Schemas · Status Models · IDs     │
└────────────┬──────────────┬──────────────┬──────────────┘
             │              │              │
     ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
     │     APP      │ │   POS    │ │    BRAIN     │
     │  (cliente)   │ │(operac.) │ │(inteligencia)│
     │              │ │          │ │              │
     │ UI catálogo  │ │ Venta    │ │ Escandallos  │
     │ Checkout     │ │ Cola     │ │ Dashboard    │
     │ Gamificación │ │ Cobro    │ │ Alertas      │
     │ Perfil       │ │ Estado   │ │ Campañas     │
     │ Quizzes      │ │ Loyalty  │ │ Pricing      │
     │ Rewards      │ │ Cierre   │ │ Forecasting  │
     └──────────────┘ └──────────┘ └──────────────┘
```

### Qué consume y escribe cada sistema

#### APP (Lee mucho, escribe poco)

**Lee de Core:**
- `catalog` → menú con disponibilidad
- `pricing` → precios actualizados
- `loyalty` → saldo de granos, nivel, streaks
- `gamification` → misiones activas, quizzes disponibles, badges
- `rewards` → catálogo de recompensas
- `customers` → perfil propio
- `orders` → historial y tracking en tiempo real
- `analytics` → recomendaciones personalizadas
- `inventory` → disponibilidad de productos

**Escribe en Core:**
- `orders` → crear pedido
- `customers` → actualizar perfil tras compra
- `loyalty` → registrar compra como fuente de puntos
- `gamification` → completar quiz, completar misión
- `rewards` → solicitar canje

#### POS (Lee y escribe operación)

**Lee de Core:**
- `catalog` → productos con precios y disponibilidad
- `orders` → pedidos entrantes de App y profesores
- `customers` → lookup por QR/código
- `loyalty` → saldo del cliente para info
- `rewards` → validar código de canje
- `inventory` → stock actual, alertas

**Escribe en Core:**
- `orders` → crear ticket/pedido POS, avanzar estado
- `inventory` → reportar consumo (implícito en venta)
- `loyalty` → otorgar puntos en venta presencial
- `customers` → actualizar perfil tras venta
- `events` → transacción completada, producto agotado

#### BRAIN (Gobierna todo, lee resultados)

**Lee de Core:**
- `orders` → todas las ventas (App + POS + profesor)
- `customers` → segmentos, patrones, perfiles
- `loyalty` → economía de puntos, tasas de canje
- `inventory` → stock real vs. teórico
- `analytics` → métricas consolidadas
- `events` → stream de eventos para alertas

**Escribe en Core:**
- `catalog` → definir productos, categorías, variantes
- `pricing` → definir y actualizar precios
- `recipes` → crear/editar escandallos
- `inventory` → ajustes de coste, stock teórico
- `suppliers` → gestión de proveedores
- `gamification` → definir quizzes, misiones, badges
- `rewards` → definir catálogo de recompensas
- `analytics` → configurar alertas, thresholds
- `locations` → configurar sedes

### Modelo de datos unificado propuesto para Firestore

```
orgs/{orgId}/
  ├── catalog/
  │   ├── products/{productId}        ← Producto maestro (nombre, imagen, categoría, tipo)
  │   ├── categories/{categoryId}     ← Categorías
  │   └── modifiers/{modifierId}      ← Modificadores (leche, tamaño, extras)
  │
  ├── pricing/
  │   └── rules/{ruleId}              ← Precio base, overrides por location/horario
  │
  ├── recipes/
  │   ├── {recipeId}                  ← Receta con coste calculado
  │   └── {recipeId}/ingredients/     ← Ingredientes con lineCost
  │
  ├── inventory/
  │   ├── raw_materials/{itemId}      ← Materia prima unificada (coste + stock)
  │   └── movements/{movementId}      ← Entradas, salidas, ajustes
  │
  ├── orders/
  │   └── {orderId}                   ← Pedido unificado (source: APP|POS|TEACHER)
  │
  ├── customers/
  │   └── {customerId}                ← Perfil unificado (segmento, loyalty, gamification)
  │
  ├── loyalty/
  │   ├── config                      ← Reglas de puntos, niveles, multipliers
  │   └── transactions/{txId}         ← Historial de puntos
  │
  ├── gamification/
  │   ├── quizzes/{quizId}            ← Quizzes dinámicos
  │   ├── missions/{missionId}        ← Misiones dinámicas
  │   ├── badges/{badgeId}            ← Badges definidos
  │   └── rewards/{rewardId}          ← Catálogo de recompensas
  │
  ├── redemptions/{redemptionId}      ← Canjes activos
  │
  ├── suppliers/
  │   ├── {supplierId}                ← Proveedor
  │   └── {supplierId}/invoices/      ← Facturas
  │
  ├── packaging/{packId}              ← Packaging
  │
  ├── staff/{uid}                     ← Empleados unificados
  │
  ├── events/{eventId}                ← Log de eventos del sistema
  │
  ├── analytics/
  │   ├── daily_stats/{date}          ← Métricas diarias pre-calculadas
  │   └── alerts/{alertId}            ← Alertas activas
  │
  └── settings/
      └── config                      ← Configuración de sede
```

### MEJORA DETECTADA: Pedidos unificados

- **PROBLEMA ACTUAL:** Tres colecciones separadas (`orders`, `tickets`, `teacher_orders`) con schemas diferentes. Reporting requiere merge manual de tres fuentes. No hay ID unificado de transacción.
- **POR QUÉ IMPORTA:** Imposible tener una vista consolidada de ventas sin código custom. Los analytics de Brain, POS e insights calculan métricas de forma independiente. Riesgo de discrepancias.
- **SOLUCIÓN PROPUESTA:** Colección única `orders` bajo la org con campo `source: "APP" | "POS" | "TEACHER"` y `type: "standard" | "teacher"`. Schema unificado con campos opcionales para cada tipo. Migrar tickets existentes.
- **IMPACTO:** App escribe el mismo schema. POS escribe el mismo schema. Brain lee una sola colección. Analytics simplificado radicalmente.
- **PRIORIDAD:** Alta.

---

## 5. Eventos Clave

### Event Model propuesto

El sistema necesita un bus de eventos ligero. En Firestore, esto puede ser una colección `events` con listeners, o usar Firestore triggers (Cloud Functions) si se necesita lógica server-side.

#### Eventos de Pedido

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `order.created` | App, POS | Brain (analytics), POS (cola) | orderId, source, items, total, customerId |
| `order.paid` | App (Stripe webhook) | Loyalty (otorgar puntos), Analytics | orderId, amount, paymentMethod |
| `order.status_changed` | POS | App (notificación), Analytics | orderId, oldStatus, newStatus, timestamp |
| `order.ready` | POS | App (push notification) | orderId, customerName, pickupCode |
| `order.picked_up` | POS | Analytics, Customer profile | orderId, prepTime, totalTime |
| `order.canceled` | POS, App | Loyalty (revertir si aplica), Inventory | orderId, reason |

#### Eventos de Loyalty y Gamificación

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `loyalty.points_earned` | Core Loyalty | App (UI update), Analytics | customerId, points, source, orderId |
| `loyalty.points_redeemed` | Core Rewards | App, POS, Analytics, Brain (márgenes) | customerId, points, rewardId |
| `loyalty.level_up` | Core Loyalty | App (celebración), Analytics | customerId, oldLevel, newLevel |
| `gamification.badge_unlocked` | Core Gamification | App (celebración) | customerId, badgeId |
| `gamification.mission_completed` | Core Gamification | App, Loyalty (bonus) | customerId, missionId, reward |
| `gamification.quiz_completed` | Core Gamification | App, Loyalty | customerId, quizId, score, points |
| `gamification.streak_updated` | Core Gamification | App | customerId, currentStreak, weeklyStreak |

#### Eventos de Catálogo y Pricing

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `catalog.product_created` | Brain | App (catálogo), POS (menú) | productId, name, category |
| `catalog.product_updated` | Brain | App, POS | productId, changes |
| `catalog.availability_changed` | Brain, POS | App (ocultar/mostrar), POS (desactivar) | productId, available, reason |
| `pricing.price_changed` | Brain | App, POS, Analytics | productId, oldPrice, newPrice, reason |

#### Eventos de Inventario y Costes

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `inventory.stock_low` | Core Inventory | POS (alerta), Brain (dashboard) | itemId, currentStock, minStock |
| `inventory.stock_depleted` | Core Inventory | POS, App (desactivar producto), Brain | itemId, productIds affected |
| `inventory.movement_logged` | POS, Brain | Analytics | itemId, type, quantity, userId |
| `recipe.cost_changed` | Brain | Analytics, Pricing | recipeId, oldCost, newCost, trigger |
| `ingredient.cost_updated` | Brain (factura) | Recipes (recalcular), Analytics | itemId, oldCost, newCost, supplierId |

#### Eventos de Cliente

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `customer.created` | App | Analytics, Brain | customerId, source, segment |
| `customer.segment_changed` | Core Customers | Brain (campañas), App (UX), Analytics | customerId, oldSegment, newSegment |
| `customer.churning_detected` | Core Customers | Brain (win-back), App (push) | customerId, lastVisit, daysSince |
| `customer.feedback_submitted` | App | Brain (dashboard) | customerId, orderId, rating, comment |

#### Eventos Operativos

| Evento | Productor | Consumidores | Datos clave |
|---|---|---|---|
| `shift.opened` | POS | Brain, Analytics | userId, timestamp, cashFloat |
| `shift.closed` | POS | Brain (cierre diario), Analytics | userId, totalSales, cashCount |
| `waste.logged` | POS | Brain (costes), Inventory | productId, quantity, reason |
| `incident.reported` | POS | Brain | type, description, userId |

---

## 6. Mejoras por Sistema

### APP — Mejoras específicas conectadas al ecosistema

**6.1 Pedido rápido y repeat order**

Hoy la App tiene un botón de "reorder" en el historial de pedidos. Pero no hay acceso directo desde la home ni personalización.

Propuesta: sección "Tu pedido habitual" en la parte superior del catálogo. Calcula el pedido más frecuente del usuario (combinación de productos más repetida) y lo muestra como un solo botón. Un toque → confirmar → checkout. Requiere datos de Core Customers (historial de pedidos).

Complemento: "Últimos pedidos" como carrusel horizontal debajo, cada uno con botón "Repetir". El reorder actual se mueve de la página de orders a la home.

**6.2 Validación de disponibilidad en tiempo real**

Hoy la App muestra todos los productos sin validar stock. Si un producto está agotado, el cliente lo descubre al llegar a recoger.

Propuesta: listener en tiempo real sobre `catalog.availability_changed`. Si un producto se marca como no disponible (sea por stock, por decisión operativa, o por horario), se muestra en gris con "Agotado" o "Disponible a partir de las X". El checkout valida stock antes de confirmar pago. Si un item queda sin stock entre que se añade al carrito y se paga, se notifica al usuario.

Requiere: Core Inventory → Core Catalog → disponibilidad como campo derivado.

**6.3 Order-ahead inteligente**

Hoy el order-ahead ofrece "ASAP (10-15 min)" o "Hora programada". Pero no tiene en cuenta la cola real ni la capacidad.

Propuesta: mostrar estimación real basada en cola activa del POS. Si hay 8 pedidos en preparación, estimar 20 min en vez de 10. Si es hora punta (detectable via enrichment de calendario académico), mostrar "Ahora hay mucha cola — tu pedido estará listo en ~25 min". Esto reduce frustración y no-shows.

Requiere: POS reporta `queueSize` como métrica en tiempo real. App lee para estimar.

**6.4 Gamificación conectada a compra real**

El sistema actual es sólido (niveles, badges, misiones, quizzes, streaks). Las mejoras:

- **Misiones contextuales:** "Prueba algo nuevo esta semana" → si el usuario siempre pide café con leche, sugerir un cortado. Requiere coffee profile + historial. Brain define la misión, App la muestra.
- **Misiones estacionales:** "Semana de exámenes: 3 cafés y ganas x2 granos". Brain las crea basándose en el calendario académico ya integrado.
- **Desafíos de exploración:** "Prueba 3 productos que nunca has pedido" → verificación automática contra historial en Core Customers.
- **Streak semanal con bonus escalonado:** Ya existe (50 granos por semana, max 150). Propuesta: hacerlo visual con un calendario tipo GitHub contribution graph en el perfil.

**6.5 Rewards conectados a márgenes**

Hoy el catálogo de rewards tiene costes en puntos fijos. No hay conexión con el coste real del producto regalado.

Propuesta: Brain calcula el coste real de cada reward (bebida gratis = food cost de esa bebida). Si una recompensa tiene un margen negativo muy alto, Brain puede ajustar su coste en granos o sugerir alternativas. El catálogo de rewards se convierte en dinámico, gobernable desde Brain.

**6.6 Personalización basada en coffee profile**

El coffee profile existe (traits: intenso, suave, explorador, etc.) pero no se usa para nada visible.

Propuesta: usar traits para ordenar el catálogo. Si el usuario es "intenso", los espressos aparecen primero. Si es "explorador", los productos nuevos se destacan. Si es "suave", las bebidas con leche van arriba. Esto es un sort personalizado del catálogo, no requiere ML — solo reglas.

Complemento: en la sección de quizzes, adaptar dificultad al `coffeeKnowledge` level. Un "novato" ve preguntas básicas, un "experto" ve preguntas sobre métodos de extracción.

**6.7 Notificaciones contextuales**

Hoy las push notifications solo se usan cuando el pedido está listo.

Propuesta: notificaciones vinculadas a eventos de Core:
- "Tu café favorito tiene precio especial hoy" (Brain → campaña → push)
- "Llevas 3 semanas viniendo cada martes — ¿repetimos?" (streak detection)
- "¡Nuevo quiz disponible! Gana 150 granos" (Brain publica quiz → push)
- "Semana de exámenes: doble de granos en pedidos antes de las 9am" (calendario académico)

### POS — Mejoras específicas para hora punta

**6.8 Menos clics para cobrar**

Hoy el flujo de cobro tiene 2 pasos: clasificación del cliente + método de pago. En hora punta, esto suma segundos por transacción.

Propuesta: modo "Venta rápida" que colapsa el proceso. Si no hay cliente identificado (QR/código), skip clasificación → pago directo. La clasificación pasa a ser opcional. Configurar en settings si el modal de clasificación es obligatorio o no.

Estimación: ahorra 3-5 segundos por venta × 50 ventas/hora = 2.5-4 minutos recuperados por hora punta.

**6.9 Modifiers en el POS**

Hoy los productos no tienen variantes ni modificadores. Un "café con leche" es un producto fijo. Si el cliente quiere leche de avena, el barista lo anota mentalmente o en notas.

Propuesta (requiere Core Catalog con modifiers): al seleccionar un producto en POS, si tiene modifiers configurados, mostrar un mini-modal o inline-selector: Tamaño (S/M/L), Leche (normal/avena/soja/almendra), Extras (shot extra, sirope). Cada modifier puede tener un delta de precio. El ticket refleja "Latte M + Avena (+0.40€)".

Esto es un cambio de modelo de datos importante. Implementar en Fase 2.

**6.10 Visibilidad de stock en tiempo real**

Hoy el POS tiene un módulo de inventario separado. Pero el barista que está vendiendo no ve alertas de stock.

Propuesta: en la interfaz de venta, si un producto está por debajo del umbral de stock, mostrar un badge naranja con "Bajo stock". Si está agotado, mostrar en rojo y desactivar. Esto previene vender algo que no se puede preparar.

Requiere: conexión entre Core Inventory y Core Catalog. Cuando `raw_materials.stock < minStock`, marcar productos que usan ese ingrediente.

**6.11 Pedidos de App bien normalizados**

Hoy los pedidos de App llegan al POS y se muestran en un panel lateral con botones de avance de estado. Funciona, pero los pedidos no tienen la misma estructura que los tickets POS.

Propuesta: con pedidos unificados (Core Orders), los pedidos de App y POS comparten schema. El dashboard unificado ya existe — solo necesita leer de una sola colección. Los pedidos de App deberían mostrar: nombre del cliente, items con cualquier modifier, hora de recogida esperada, si es repeat customer, y su nivel de loyalty (para dar trato preferente a clientes "Barista" level).

**6.12 Tiempos operativos y alertas**

Hoy el POS registra `preparationTimeSecs` en pedidos de App. Pero no hay alertas si un pedido lleva demasiado tiempo.

Propuesta: si un pedido pasa >5 min en PREPARING sin avanzar a READY, mostrar alerta visual parpadeante. Si un pedido está READY >10 min sin PICKED_UP, sugerir contactar al cliente (si tiene push habilitado, enviar recordatorio). Registrar estos tiempos como métricas para Brain.

**6.13 Cierre de caja estructurado**

No veo un flujo de cierre de caja en el POS actual. El reporting muestra ventas por día, pero no hay un "cierre" formal.

Propuesta: al final del turno, flujo de cierre que pide: conteo de efectivo, resumen de ventas (auto-calculado), diferencia efectivo esperado vs. contado, notas de incidencias, productos desperdiciados. Esto genera un evento `shift.closed` que Brain consume para reporting.

### BRAIN — De repositorio a motor de decisiones

**6.14 Refactorizar el monolito de 6500 líneas**

El `page.tsx` de Brain no tiene 6500 líneas (según exploración tiene ~800 en la versión actual), pero sigue siendo un componente monolítico con todo el estado. Ya hay un inicio de extracción (`HomeSection`, `OrgConfigSection`, `InvoiceSection`).

Propuesta: continuar extracción hasta tener:
- `sections/DashboardSection` (KPIs, profitability, alertas)
- `sections/CatalogSection` (materias primas)
- `sections/RecipesSection` (escandallos)
- `sections/SKUSection` (productos maestros)
- `sections/SuppliersSection` (proveedores + facturas)
- `sections/InventorySection` (stock unificado)
- `sections/PricingSection` (nueva: gobierno de precios)
- `sections/LoyaltySection` (nueva: economía de rewards)
- `sections/CustomersSection` (nueva: segmentos, perfiles)
- `sections/CampaignsSection` (nueva: campañas)

**6.15 Alertas proactivas**

Hoy Brain muestra food cost % con colores. Pero no alerta proactivamente.

Propuesta: motor de alertas basado en reglas configurables:
- "Food cost de Latte superó 35%" → alerta + sugerencia (subir precio 0.20€ o buscar proveedor alternativo)
- "Ingrediente X subió 15% en última factura" → alerta con impacto en recetas afectadas
- "Stock teórico de leche debería agotarse en 2 días" → alerta de reposición
- "Cliente segmento 'loyal' no compra hace 15 días" → alerta de churn
- "Ventas de producto Y cayeron 40% esta semana" → alerta de producto lastre

**6.16 Pricing intelligence**

Hoy Brain calcula margen como `sellingPrice - totalCost`. Pero no sugiere precios.

Propuesta: para cada SKU, Brain muestra:
- Food cost actual (%)
- Margen actual (€)
- Precio sugerido para food cost objetivo (ej: 25%)
- Impacto de cambio de precio en demanda estimada (basado en elasticidad observada)
- Comparación con productos similares de la misma categoría
- Botón "Aplicar precio sugerido" que actualiza Core Pricing → baja a App y POS

**6.17 Segmentación de clientes visible**

Hoy la segmentación se calcula en la App pero Brain no la ve.

Propuesta: Brain tiene una sección de Customers que muestra:
- Distribución por segmento (new/occasional/regular/loyal/churning) con gráfico
- Lista de clientes churning con última visita y gasto promedio
- Clientes top por gasto y por frecuencia
- Segmentos por coffee profile traits
- Evolución de segmentos en el tiempo

**6.18 Campañas automáticas**

Hoy no existen campañas.

Propuesta: Brain puede crear campañas que se ejecutan automáticamente:
- "Win-back churning" → a clientes que no vienen en 15+ días, activar push con oferta (ej: misión especial con bonus de granos)
- "Boost producto lastre" → producto con pocas ventas, ofrecerlo como quiz reward o como sugerencia personalizada
- "Upsell margin play" → detectar que clientes que piden X suelen aceptar Y (datos de itemPairs), sugerir combo con margen mejor
- Cada campaña tiene: trigger, audiencia (segmento), acción (push, reward, misión), duración, métricas de éxito

**6.19 Forecasting básico**

Con los datos de enrichment (clima, calendario, día de semana, hora), Brain tiene suficiente para predecir demanda.

Propuesta: modelo simple (sin ML, basado en promedios históricos con ajuste contextual):
- "Mañana es martes de exámenes con lluvia prevista → esperar 120 pedidos (+15% vs. normal)"
- "Viernes antes de festivo → esperar 60 pedidos (-30%)"
- Esto alimenta recomendaciones de preparación de stock y personal.

**6.20 Productos estrella vs. productos lastre**

Brain ya tiene profitability por producto. Propuesta de clasificación automática:

| Cuadrante | Ventas | Margen | Acción |
|---|---|---|---|
| Estrella | Altas | Alto | Proteger, destacar en App |
| Vaca | Altas | Bajo | Optimizar coste o subir precio |
| Nicho | Bajas | Alto | Promocionar, hacer visible |
| Lastre | Bajas | Bajo | Descontinuar o reformular |

Mostrar esta matriz en el dashboard de Brain con cada producto posicionado.

---

## 7. Flujos Críticos

### Flujo 1: Pedido desde App hasta entrega

**Actores:** Cliente, Barista, Sistema
**Sistemas:** App → Core Orders → POS → Core Inventory → Core Loyalty → Core Gamification

```
1. Cliente abre App → ve catálogo (Core Catalog, filtrado por disponibilidad)
2. Añade productos al carrito
3. Va a checkout → selecciona ASAP o programado
4. App valida stock en tiempo real (Core Inventory → disponibilidad)
   → Si algún item no disponible: notifica, sugiere alternativa
5. Cliente paga (Stripe) o elige efectivo
6. Evento: order.created
   → Core Orders crea pedido con status PAYMENT_PENDING (card) o IN_QUEUE (cash)
7. Stripe webhook confirma pago → status = PAID → IN_QUEUE
   → Evento: order.paid
8. POS recibe pedido en cola (listener en tiempo real)
   → Muestra: nombre, items, hora estimada, nivel loyalty del cliente
9. Barista avanza a PREPARING → Evento: order.status_changed
   → App muestra "Preparando tu pedido"
10. Barista avanza a READY → Evento: order.ready
    → App envía push notification + sonido
11. Cliente recoge → barista avanza a PICKED_UP
    → Evento: order.picked_up
12. Post-venta asíncrona:
    → Core Loyalty: otorga puntos (total × 100 + streak bonus)
    → Core Gamification: check badges, advance missions, update streak
    → Core Customers: actualiza perfil (visitas, gasto, segmento)
    → Core Inventory: decrementa stock teórico según recetas de los items
    → Core Analytics: registra métricas enriched (clima, calendario, combos)
```

**Source of truth:** Core Orders para el estado del pedido.
**Riesgo:** Pago confirmado pero pedido no llega al POS (Stripe webhook falla). Mitigación: retry del webhook, polling de fallback, alerta si pedido pagado >2 min sin status change.
**Mejora:** Añadir estimación de tiempo real basada en cola, no tiempo fijo.

### Flujo 2: Canje de recompensa

**Actores:** Cliente, Barista
**Sistemas:** App → Core Rewards → POS

```
1. Cliente va a /rewards en App
2. Ve catálogo de rewards con su saldo de granos
3. Selecciona reward (ej: "Bebida gratis" por 1500 granos)
4. App verifica saldo → suficiente
5. Core Rewards:
   → Deduce 1500 granos del saldo
   → Genera código de 6 caracteres (48h validez)
   → Registra redemption con status "pending"
   → Evento: loyalty.points_redeemed
6. Cliente muestra código en POS (o escanea QR)
7. Barista introduce código en RedemptionValidator del POS
8. POS verifica:
   → Código existe y status = "pending"
   → No expirado
   → Muestra reward: "Bebida gratis"
9. Barista prepara el producto
10. POS marca redemption como "used"
    → Evento: reward.used
11. Core Analytics: registra coste de reward contra food cost del producto
12. Brain: ve impacto de rewards en márgenes del día
```

**Source of truth:** Core Rewards para estado del canje.
**Riesgo:** Código usado dos veces (race condition si dos baristas lo procesan). Mitigación: transacción atómica en Firestore para cambio de status.
**Riesgo:** Cliente genera código pero no lo usa → expira a las 48h. Puntos no se devuelven. Decidir política.
**Mejora:** Añadir opción de canje directo sin código — si el cliente está identificado en POS (QR), el barista puede aplicar reward directamente.

### Flujo 3: Cambio de receta / coste

**Actores:** Manager, Sistema
**Sistemas:** Brain → Core Recipes → Core Pricing → POS, App

```
1. Brain recibe factura de proveedor (PDF)
2. Claude extrae líneas de factura
3. Manager revisa y aplica → POST /invoices/apply
4. Core Inventory actualiza costes de materias primas afectadas
   → Evento: ingredient.cost_updated (para cada item)
5. Core Recipes recalcula automáticamente:
   → Todas las recetas que usan esos ingredientes
   → Nuevo totalCost, nuevo foodCostPct
   → Evento: recipe.cost_changed (para cada receta afectada)
6. Core Pricing evalúa:
   → Si nuevo foodCost > threshold (ej: 35%), genera alerta
   → Sugiere nuevo precio para mantener margen objetivo
7. Brain muestra:
   → Alerta: "Leche subió 12% → Latte pasó de 28% a 32% food cost"
   → Sugerencia: "Subir precio de 3.50€ a 3.70€ para volver a 28%"
8. Si manager aprueba nuevo precio:
   → Core Pricing actualiza → evento: pricing.price_changed
   → App ve nuevo precio inmediatamente (listener)
   → POS ve nuevo precio inmediatamente (listener)
9. Si manager no aprueba:
   → Alerta queda activa en Brain dashboard
   → Margen comprimido queda registrado
```

**Source of truth:** Core Recipes para costes. Core Pricing para precios de venta.
**Riesgo:** Cambio de coste masivo (proveedor sube todo 10%) genera cascada de recálculos. Mitigación: batch processing, preview antes de aplicar.

### Flujo 4: Producto sin stock

**Actores:** Sistema, Barista, Cliente
**Sistemas:** Core Inventory → Core Catalog → POS, App

```
1. Core Inventory detecta que materia prima X llega a stock = 0
   (o barista marca manualmente "agotado" en POS)
   → Evento: inventory.stock_depleted
2. Core Catalog identifica qué productos usan ingrediente X (via recetas)
   → Para cada producto afectado: marca available = false
   → Evento: catalog.availability_changed (para cada producto)
3. POS:
   → Producto aparece en gris con badge "Sin stock"
   → No se puede añadir a venta
   → Si estaba en un pedido en curso, alerta al barista
4. App:
   → Producto desaparece del catálogo (o se muestra tachado)
   → Si estaba en carrito de alguien, notificación: "X ya no está disponible"
   → Sugiere alternativa (producto similar disponible)
5. Brain:
   → Dashboard muestra alerta de rotura de stock
   → Si hay proveedor asociado, sugiere hacer pedido
6. Cuando llega reposición:
   → POS o Brain registra entrada de stock
   → Core Inventory actualiza → marca productos como disponibles
   → Evento: catalog.availability_changed (available = true)
   → App y POS reactivan el producto automáticamente
```

**Source of truth:** Core Inventory para stock. Core Catalog para disponibilidad.
**Riesgo:** Falso positivo — stock teórico dice 0 pero hay stock real (discrepancia). Mitigación: el barista puede override manual de disponibilidad en POS.

### Flujo 5: Gamificación conectada a compra real

**Actores:** Cliente, Sistema
**Sistemas:** Core Orders → Core Loyalty → Core Gamification → Core Customers → App

```
1. Pedido completado (order.picked_up)
2. Core Loyalty calcula puntos:
   → Base: total × 100 (1€ = 100 granos)
   → Streak bonus: Math.min((weeklyStreak - 1) × 50, 150)
   → Total: base + bonus
   → Evento: loyalty.points_earned
3. Core Gamification evalúa:
   a. Badges:
      → ¿Primera compra? → badge "first-sip"
      → ¿5 productos únicos? → badge "flavor-explorer"
      → ¿25 compras? → badge "loyal-regular"
      → Si nuevo badge → Evento: gamification.badge_unlocked
   b. Misiones:
      → ¿Misión activa "m-first-purchase"? → completar
      → ¿Misión "m-try-3" y uniqueProducts >= 5? → completar
      → Si misión completada → bonus granos + Evento: gamification.mission_completed
   c. Streak:
      → Actualizar currentStreak y weeklyStreak
      → Evento: gamification.streak_updated
   d. Coffee Profile:
      → Recalcular traits basado en historial actualizado
      → Recalcular coffeeKnowledge si aplica
4. Core Customers actualiza perfil:
   → totalVisits++, totalSpent += total
   → Recalcula segmento (new → occasional → regular → loyal)
   → Si segmento cambió → Evento: customer.segment_changed
5. App recibe eventos y muestra:
   → "+250 granos" animación
   → Si badge nuevo: modal de celebración
   → Si level up: animación especial
   → Si misión completada: confetti + reward
   → Perfil actualizado con nuevo saldo
```

**Source of truth:** Core Loyalty para puntos. Core Gamification para estado de juego.
**Mejora:** Añadir multipliers contextuales — doble granos en semana de exámenes, bonus por pedido antes de las 9am, triple granos en tu cumpleaños (si tiene dato).

### Flujo 6: Order-ahead en hora punta

**Actores:** Cliente, Barista, Sistema
**Sistemas:** App → Core Orders → POS

```
1. Cliente abre App a las 10:15 (mid_morning, hora punta)
2. App muestra banner contextual: "Ahora hay cola — pedido listo en ~20 min"
   (estimación basada en queueSize del POS + promedio de prepTime)
3. Cliente selecciona productos → checkout
4. Opción ASAP muestra: "Estimado: 10:35"
   Opción SCHEDULED muestra slots: 10:30, 10:45, 11:00
   (slots generados basados en capacidad: max N pedidos por slot)
5. Cliente elige 10:45 → paga → order.created
6. POS recibe pedido con pickupAt = 10:45
   → Lo ordena en cola por pickupAt (no por createdAt)
   → Los pedidos ASAP van primero, los scheduled se preparan en su ventana
7. A las 10:40, POS alerta: "Preparar pedido #47 para 10:45"
8. Barista prepara → READY a las 10:43
9. App notifica al cliente: "Tu pedido está listo — recógelo en barra"
10. Si cliente no recoge en 15 min → POS alerta "Pedido #47 sin recoger"
```

**Riesgo:** Demasiados order-ahead saturan la capacidad. Mitigación: límite de pedidos por slot configurable. Si un slot está lleno, no se ofrece en App.
**Riesgo:** Clientes piden para "ahora" pero llegan en 30 min → pedido frío. Mitigación: preparar solo cuando cliente confirma que está en camino (botón "Voy para allá" en App que desencadena preparación).

### Flujo 7: Multi-sede futuro

**Diseño para escalabilidad:**

```
orgs/{orgId}/                        ← Ya existe, es la base
  locations/{locationId}/            ← Nueva colección
    config                           ← Horarios, dirección, capacidad
    staff/{uid}                      ← Personal por sede
    inventory/                       ← Stock por sede
    daily_stats/                     ← Métricas por sede

  catalog/products/                  ← Compartido entre sedes
  recipes/                           ← Compartido
  suppliers/                         ← Compartido (o por sede)
  pricing/rules/                     ← Pueden tener overrides por locationId
  customers/                         ← Compartido (un cliente puede ir a varias sedes)
```

**Principios:**
- Un producto existe una vez en el catálogo → disponibilidad es por sede
- Una receta existe una vez → el coste puede variar por proveedor local
- Un cliente existe una vez → su historial incluye sede de cada pedido
- Los precios base son globales → con overrides opcionales por sede
- El stock es siempre por sede
- El reporting es por sede con consolidación global en Brain
- La gamificación es global (un cliente no pierde nivel al cambiar de sede)

**Cambios necesarios:**
- Añadir `locationId` a Core Orders
- Inventory scoped a location
- Pricing rules con campo `locationId` opcional
- Brain dashboards con filtro por sede + vista global
- App detecta sede más cercana (o selección manual)

---

## 8. Riesgos Actuales

### Riesgo 1: Deuda técnica — Brain monolítico
**Severidad:** Media
**Descripción:** El page.tsx principal de Brain, aunque más pequeño de lo reportado inicialmente (~800 líneas), sigue siendo un componente único con todo el estado. Ya hay inicio de refactoring (HomeSection, OrgConfigSection).
**Impacto:** Dificulta añadir nuevas secciones (Customers, Campaigns, Pricing Intelligence). Cada cambio puede romper otras partes.
**Mitigación:** Completar extracción en componentes antes de añadir funcionalidad nueva.

### Riesgo 2: Duplicidad de datos — Inventario paralelo
**Severidad:** Alta
**Descripción:** POS tiene `inventory` + `inventory_movements` + `inventory_categories` + `inventory_suppliers`. Brain tiene `catalog` (materias primas con costes). Son dos mundos.
**Impacto:** El coste real de un ingrediente puede diferir entre Brain y POS. El stock real (POS) no alimenta decisiones de Brain. Un proveedor puede estar en ambos sitios con datos distintos.
**Mitigación:** Unificar en Core Inventory. Brain define costes y proveedores. POS reporta movimientos de stock. Una sola colección.

### Riesgo 3: Sincronización manual de precios
**Severidad:** Alta
**Descripción:** El sync POS→Brain es un botón manual. Requiere que alguien lo pulse. No hay sincronización inversa (Brain→POS).
**Impacto:** Precios inconsistentes entre sistemas. Márgenes calculados sobre precios desactualizados. El cliente puede ver un precio en App distinto al que Brain usa para calcular food cost.
**Mitigación:** Core Pricing como fuente única. Brain escribe, POS y App leen. Sin sync manual.

### Riesgo 4: Gamificación solo client-side
**Severidad:** Media
**Descripción:** Toda la lógica de gamificación (engine.ts) se ejecuta en el navegador del cliente. No hay validación server-side.
**Impacto:** Un usuario técnico podría manipular sus puntos o completar quizzes sin responder. No hay audit trail server-side de las transacciones de gamificación.
**Mitigación:** A corto plazo, validar transacciones de puntos con Firestore rules más estrictas (verificar que existe un pedido real asociado). A largo plazo, mover el motor a Cloud Functions.

### Riesgo 5: Sin tests automatizados
**Severidad:** Alta
**Descripción:** No hay tests en ninguna de las tres apps. Un sistema con pagos (Stripe), gamificación económica (puntos canjeables), y escandallos (márgenes del negocio) requiere tests.
**Impacto:** Cualquier cambio en el motor de loyalty puede romper la economía de puntos. Un bug en checkout puede cobrar mal. Un error en cálculo de food cost puede distorsionar decisiones de pricing.
**Mitigación:** Tests prioritarios para: (1) loyalty points calculation, (2) Stripe checkout flow, (3) recipe cost calculation, (4) order status transitions.

### Riesgo 6: Inconsistencia de versiones Next.js
**Severidad:** Baja
**Descripción:** App y POS usan Next.js 14 + React 18. Brain usa Next.js 16 + React 19.
**Impacto:** El paquete compartido debe ser compatible con ambas versiones. Dependencias pueden tener breaking changes entre React 18 y 19.
**Mitigación:** Unificar a la misma versión. Recomendación: subir App y POS a Next.js 15+ cuando sea estable.

### Riesgo 7: Credentials en historial de Git
**Severidad:** Crítica
**Descripción:** Ya documentado en análisis previo. `raizygrano-admin.json` puede haber sido commiteado.
**Impacto:** Acceso completo a Firebase con privilegios de admin.
**Mitigación:** Rotar service account key inmediatamente. Verificar historial de git.

### Riesgo 8: Sin backup de Firestore
**Severidad:** Alta
**Descripción:** No se menciona estrategia de backup de Firestore.
**Impacto:** Si se corrompen datos (bug en write, error humano, etc.), no hay forma de recuperar.
**Mitigación:** Configurar Firestore scheduled exports a Cloud Storage.

---

## 9. Roadmap por Fases

### Fase 0 — Higiene y seguridad (1-2 semanas)

**Objetivo:** Resolver riesgos críticos antes de evolucionar.

**Cambios clave:**
- Rotar credentials de Firebase si fueron expuestas
- Configurar Firestore scheduled backups
- Añadir tests para: loyalty points, Stripe checkout, recipe cost calc
- Unificar Next.js version (o al menos verificar compatibilidad de shared)

**Dependencias:** Ninguna.
**Riesgo:** Bajo.
**Quick wins:** Backup de Firestore (1 hora de setup). Rotación de keys (30 min).
**Impacto:** Seguridad del sistema garantizada.

### Fase 1 — Ordenar dominio y fuentes de verdad (3-4 semanas)

**Objetivo:** Que cada dato tenga un solo dueño.

**Cambios clave:**
1. Unificar staff en `orgs/{orgId}/staff/{uid}` → migrar cafe_users + staff + members
2. Unificar inventario: Brain `catalog` + POS `inventory` → una sola colección Core Inventory
3. Mover catálogo de rewards a Firestore (colección dinámica, no hardcoded)
4. Mover quizzes y misiones a Firestore (colecciones dinámicas)
5. Expandir `packages/shared` con tipos unificados (Product, Order, Customer, Reward, Quiz, Mission)

**Dependencias:** Fase 0 completada.
**Riesgo:** Migraciones de datos. Usar scripts de migración con rollback.
**Quick wins:** Rewards dinámicos (2-3 días). Quizzes dinámicos (2-3 días). Ambos desbloquean gobernabilidad desde Brain sin tocar mucho código.
**Impacto:** Brain puede gobernar gamificación. Inventario unificado.

### Fase 2 — Unificar catálogo, pedidos y pricing (4-6 semanas)

**Objetivo:** Una sola fuente para productos, precios y ventas.

**Cambios clave:**
1. Core Catalog: Brain define productos → POS y App leen. Eliminar duplicidad.
2. Core Pricing: Brain define precios → App y POS consumen. Eliminar sync manual.
3. Core Orders: Unificar `orders` + `tickets` + `teacher_orders` en una colección con schema unificado.
4. Soporte de modifiers en Core Catalog (tamaños, leches, extras).
5. Conectar disponibilidad a stock (producto → receta → ingredientes → stock).

**Dependencias:** Fase 1 (inventario unificado, tipos compartidos).
**Riesgo:** Migración de tickets históricos (hay datos analíticos valiosos en el formato actual). Mantener colecciones legacy como read-only durante transición.
**Quick wins:** Pricing centralizado elimina el botón de sync-pos (victoria operativa inmediata). Disponibilidad conectada a stock reduce "pedidos imposibles".
**Impacto:** Transformativo. Por primera vez, el ecosistema funciona como un sistema.

### Fase 3 — Event model y telemetría (2-3 semanas)

**Objetivo:** Los sistemas se hablan a través de eventos, no de sincronizaciones manuales.

**Cambios clave:**
1. Implementar event log en Firestore (`orgs/{orgId}/events/`)
2. Definir schemas de eventos (TypeScript en Core)
3. Listeners en cada app: App escucha availability_changed, POS escucha order.created desde App, Brain escucha order.completed para analytics
4. Instrumentar métricas: cada pedido, cada canje, cada cambio de precio genera evento
5. Dashboard de eventos en Brain (timeline de actividad)

**Dependencias:** Fase 2 (pedidos unificados generan eventos consistentes).
**Riesgo:** Bajo. Aditivo, no destructivo.
**Quick wins:** `order.ready` → push notification (ya existe parcialmente, solo formalizar). `inventory.stock_low` → alerta en POS (alto valor operativo).
**Impacto:** El sistema se vuelve reactivo. Las cosas pasan automáticamente.

### Fase 4 — Brain como motor de decisión (4-6 semanas)

**Objetivo:** Brain pasa de dashboard a cerebro activo.

**Cambios clave:**
1. Motor de alertas con reglas configurables
2. Pricing intelligence: sugerencias de precio basadas en food cost objetivo
3. Segmentación visible: distribución de clientes, churning alerts
4. Clasificación productos (estrella/vaca/nicho/lastre)
5. Campañas básicas: win-back de churning, boost de productos lastre
6. Forecasting básico (promedios históricos + contexto)
7. Completar refactoring de Brain en componentes

**Dependencias:** Fase 3 (eventos alimentan alertas y analytics).
**Riesgo:** Complejidad de UI. Brain necesita mucho frontend nuevo.
**Quick wins:** Alertas de food cost (1-2 días sobre lo existente). Clasificación de productos (1 día, los datos ya están).
**Impacto:** Brain empieza a generar valor proactivo. Las decisiones de negocio mejoran.

### Fase 5 — Personalización avanzada (3-4 semanas)

**Objetivo:** Cada cliente tiene una experiencia única.

**Cambios clave:**
1. Catálogo personalizado: orden de productos basado en coffee profile
2. Recomendaciones: "Basado en tus gustos, prueba X" (reglas, no ML)
3. Misiones contextuales: basadas en calendario académico + comportamiento
4. Notificaciones push contextuales (no solo order.ready)
5. "Tu pedido habitual" en home de App
6. Multipliers de granos contextuales (exámenes, cumpleaños, primera compra del día)

**Dependencias:** Fase 4 (segmentación activa, campañas).
**Riesgo:** Privacidad — ser transparente sobre qué datos se usan. RGPD compliance.
**Quick wins:** "Tu pedido habitual" (2-3 días, datos ya existen). Misiones de exámenes (Brain las crea vía calendario, 1-2 días).
**Impacto:** Adopción de App sube. Recurrencia aumenta. Ticket medio potencialmente sube.

### Fase 6 — Multi-sede y franquiciabilidad (6-8 semanas)

**Objetivo:** El sistema soporta varias ubicaciones.

**Cambios clave:**
1. Modelo `locations/{locationId}` bajo org
2. Inventario scoped por sede
3. Staff asignado por sede
4. Pricing con overrides por sede
5. App con selector de sede (o detección GPS)
6. Brain con dashboards por sede + consolidado
7. Reportes comparativos entre sedes

**Dependencias:** Fases 1-5 completadas. El sistema debe estar unificado antes de fragmentar por sede.
**Riesgo:** Alto. Requiere cambios en todas las apps. Testear exhaustivamente.
**Quick wins:** Ninguno. Esta fase es puramente de escalabilidad.
**Impacto:** El sistema está listo para crecer.

---

## 10. Mejoras Extra Detectadas

### MEJORA: Feedback conectado a perfil y a Brain

- **PROBLEMA ACTUAL:** La colección `feedback` existe pero está desconectada. Brain no ve los ratings. El perfil del cliente no refleja su satisfacción.
- **SOLUCIÓN PROPUESTA:** Feedback como evento (`customer.feedback_submitted`) → Brain muestra NPS por producto, por periodo, por segmento. Customer profile incluye avgRating. Productos con bajo rating aparecen en alertas de Brain.
- **PRIORIDAD:** Media.

### MEJORA: Economía de granos con balance real

- **PROBLEMA ACTUAL:** Los granos se otorgan a razón fija (1€ = 100). El coste real de un canje de "bebida gratis" (1500 granos = 15€ de compra) no se compara con el food cost de esa bebida (~4€). El ratio es favorable para el negocio, pero no está gobernado.
- **SOLUCIÓN PROPUESTA:** Brain tiene vista de "economía de loyalty": cuántos granos en circulación, tasa de canje, coste real de canjes vs. revenue generado por el programa. Si el coste de canjes supera un % del revenue, alertar. Permite ajustar la ratio granos/€ o el coste de rewards de forma informada.
- **PRIORIDAD:** Media.

### MEJORA: QR de pedido para pickup

- **PROBLEMA ACTUAL:** El cliente recoge el pedido diciendo su nombre.
- **SOLUCIÓN PROPUESTA:** Cada pedido genera un QR único que el cliente muestra al recoger. El barista lo escanea con el scanner ya integrado en POS. Esto confirma pickup automáticamente (avanza a PICKED_UP), es más rápido que buscar por nombre, y cierra el loop de trazabilidad.
- **PRIORIDAD:** Media.

### MEJORA: Combo builder en App

- **PROBLEMA ACTUAL:** Los combos se detectan post-hoc (hasCombo = bebida + comida). Pero no hay incentivo explícito para comprar combos.
- **SOLUCIÓN PROPUESTA:** En el carrito, si el usuario tiene solo bebida, sugerir "Añade un croissant por solo 2€ (ahorra 0.50€)". Brain define los combos (producto A + producto B → precio especial). Core Pricing gestiona la regla. Alto impacto en ticket medio.
- **PRIORIDAD:** Media-alta.

### MEJORA: Modo offline resiliente en POS

- **PROBLEMA ACTUAL:** La App tiene offline page, pero el POS no parece tener modo offline.
- **SOLUCIÓN PROPUESTA:** POS debería poder operar sin internet temporalmente. Cola local de tickets → sync cuando vuelva la conexión. Catálogo cacheado localmente. Esto es crítico en hora punta si cae el WiFi.
- **PRIORIDAD:** Alta (operativamente crítico).

### MEJORA: Wallet digital del cliente visible en POS

- **PROBLEMA ACTUAL:** El POS puede buscar al cliente por QR o código numérico y ver sus puntos. Pero no muestra su nivel, badges, ni historial.
- **SOLUCIÓN PROPUESTA:** Al identificar un cliente en POS, mostrar mini-perfil: nivel (Semilla/Brote/Raíz/Cosecha/Barista), granos disponibles, última visita, producto favorito. Esto permite al barista personalizar la interacción: "¡Hola María, tu cortado de siempre? Estás a 200 granos de subir a Cosecha".
- **PRIORIDAD:** Media.

### MEJORA: Waste tracking conectado a Brain

- **PROBLEMA ACTUAL:** No hay registro formal de desperdicio.
- **SOLUCIÓN PROPUESTA:** Botón en POS de "Registrar desperdicio" → producto, cantidad, motivo (caducado, error de preparación, devuelto). Genera evento `waste.logged`. Brain muestra waste rate por producto, por día, por barista. Esto afecta directamente al margen real vs. margen teórico.
- **PRIORIDAD:** Media-alta.

### MEJORA: Cierre diario automático en Brain

- **PROBLEMA ACTUAL:** Brain no tiene concepto de "día cerrado" con métricas definitivas.
- **SOLUCIÓN PROPUESTA:** A las 23:59 (o cuando el último turno cierra), Brain genera automáticamente un resumen diario: revenue total, revenue por canal, margen real (ventas - costes consumidos), desperdicio, canjes de rewards, nuevos clientes, clientes churning detectados. Este resumen se guarda en `analytics/daily_stats/{date}` y es la base para tendencias semanales/mensuales.
- **PRIORIDAD:** Media.

---

## Apéndice A: Estructura técnica propuesta para packages/core

```
packages/
├── shared/                          ← Mantener para backwards compatibility
│   ├── index.ts                     ← Re-exporta desde core
│   ├── firebase.ts
│   ├── weather-enrichment.ts
│   └── category-resolver.ts
│
└── core/                            ← Nuevo paquete
    ├── package.json
    ├── index.ts                     ← Barrel exports
    │
    ├── types/
    │   ├── catalog.ts               ← Product, Category, Modifier, Variant
    │   ├── orders.ts                ← UnifiedOrder, OrderItem, OrderStatus
    │   ├── customers.ts             ← CustomerProfile, Segment, CoffeeProfile
    │   ├── loyalty.ts               ← PointsTransaction, Level, Streak
    │   ├── gamification.ts          ← Badge, Mission, Quiz, GameState
    │   ├── rewards.ts               ← Reward, Redemption, RewardsCatalog
    │   ├── recipes.ts               ← Recipe, Ingredient, CostBreakdown
    │   ├── inventory.ts             ← RawMaterial, StockMovement, StockAlert
    │   ├── pricing.ts               ← PriceRule, PriceOverride
    │   ├── suppliers.ts             ← Supplier, Invoice, InvoiceLine
    │   ├── events.ts                ← EventSchema, EventType (union type)
    │   ├── permissions.ts           ← Role, StaffMember, OrgMembership
    │   ├── locations.ts             ← Location, LocationConfig
    │   └── common.ts                ← Timestamp, ID helpers, status enums
    │
    ├── services/
    │   ├── catalog-service.ts       ← CRUD productos, disponibilidad
    │   ├── order-service.ts         ← Crear, avanzar, cancelar pedidos
    │   ├── customer-service.ts      ← Perfil, segmentación
    │   ├── loyalty-service.ts       ← Puntos, niveles, streaks
    │   ├── gamification-service.ts  ← Badges, misiones, quizzes
    │   ├── rewards-service.ts       ← Catálogo, canjes, validación
    │   ├── recipe-service.ts        ← Escandallos, cálculo de costes
    │   ├── inventory-service.ts     ← Stock, movimientos, alertas
    │   ├── pricing-service.ts       ← Reglas, overrides, sugerencias
    │   ├── event-service.ts         ← Emitir y escuchar eventos
    │   └── analytics-service.ts     ← Métricas, enrichment, KPIs
    │
    ├── utils/
    │   ├── enrichment.ts            ← Weather + calendar enrichment
    │   ├── unit-conversion.ts       ← g↔kg, ml↔L
    │   ├── food-cost.ts             ← Cálculos de food cost %
    │   └── id-generator.ts          ← IDs únicos, códigos de canje
    │
    └── constants/
        ├── order-statuses.ts
        ├── segments.ts
        ├── levels.ts
        └── time-slots.ts
```

### Contratos de APIs entre sistemas

**Brain → Core (escritura de gobierno):**
- `catalog.createProduct(product)` → devuelve productId
- `pricing.setPrice(productId, price, locationId?)` → actualiza precio
- `recipes.updateRecipe(recipeId, ingredients)` → recalcula costes
- `gamification.publishQuiz(quiz)` → quiz disponible en App
- `gamification.createMission(mission)` → misión activa
- `rewards.updateCatalog(rewards)` → catálogo actualizado
- `inventory.applyInvoice(items)` → costes actualizados

**App → Core (escritura de cliente):**
- `orders.createOrder(order)` → crea pedido, valida stock
- `loyalty.earnPoints(customerId, orderId, amount)` → otorga puntos
- `rewards.requestRedemption(customerId, rewardId)` → genera código
- `gamification.completeQuiz(customerId, quizId, answers)` → evalúa y otorga
- `customers.updateProfile(customerId, data)` → actualiza perfil

**POS → Core (escritura operativa):**
- `orders.createTicket(ticket)` → crea venta POS
- `orders.advanceStatus(orderId, newStatus)` → avanza estado
- `loyalty.awardPoints(customerId, ticketId, amount)` → puntos en POS
- `rewards.redeemCode(code)` → marca canje como usado
- `inventory.logMovement(movement)` → registra entrada/salida/ajuste
- `events.logWaste(waste)` → registra desperdicio

### Estados y sincronización

| Dato | Modo | Justificación |
|---|---|---|
| Estado de pedido | Tiempo real (Firestore listener) | El cliente necesita ver cambios inmediatos |
| Catálogo/precios | Tiempo real (Firestore listener) | Disponibilidad debe reflejarse al instante |
| Saldo de puntos | Tiempo real | El cliente necesita ver su saldo actual |
| Stock levels | Eventual (cada venta decrementa) | No requiere milisegundos de precisión |
| Métricas/analytics | Batch (pre-calculado diario) | No requiere tiempo real, consume resources |
| Food cost | Eventual (recalcula al cambiar coste) | Cascading recalc no debe bloquear UI |
| Segmentación | Eventual (post-pedido) | Cálculo async tras cada compra |
| Recomendaciones | Cacheado (recalcula periódicamente) | No cambia en cada request |
| Coffee profile | Eventual (post-pedido, post-quiz) | Derivado de comportamiento acumulado |

### Observabilidad recomendada

**Dashboards críticos para Brain:**
1. Revenue diario por canal (App vs POS vs Teacher) — tiempo real
2. Food cost promedio por categoría — actualizado al cambiar costes
3. Distribución de segmentos de clientes — semanal
4. Tasa de canje de rewards (canjes/granos en circulación) — semanal
5. Productos por cuadrante (estrella/vaca/nicho/lastre) — mensual
6. Forecast vs. real (cuando exista forecasting) — diario

**Anomalías a detectar:**
- Food cost > 35% en cualquier producto
- Caída de revenue >30% vs. mismo día semana anterior
- Cliente loyal que no viene en 15+ días
- Producto con >5 desperdicios en una semana
- Diferencia stock teórico vs. real >20%
- Pedidos cancelados >5% del total diario
- Tiempo de preparación >2× promedio
- Pico inusual de canjes (posible abuso)

---

*Este documento es la base para evolucionar Raíz y Grano de tres apps independientes a un ecosistema unificado. Cada fase del roadmap es incremental y no rompe lo ya construido. La prioridad es: primero ordenar datos (Fase 0-1), luego unificar operación (Fase 2-3), después potenciar inteligencia (Fase 4-5), y finalmente escalar (Fase 6).*
