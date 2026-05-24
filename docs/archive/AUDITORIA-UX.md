# Auditoría UX — Raíz y Grano

24 marzo 2026 · Cubre apps/app, apps/pos, apps/brain

---

## APP CLIENTE (lo que ven los clientes)

### CRÍTICOS

**UX-1 · No hay pantalla de confirmación para pedidos sin Stripe**
`apps/app/app/checkout/CheckoutClient.tsx` línea 179

Después de un pedido con pago en tienda, el usuario va a `/orders` directamente. No ve un "¡Pedido confirmado!" con su número de pedido. El flujo de Stripe sí tiene `/checkout/success` con confeti y resumen, pero el flujo normal no.

→ El cliente no sabe si su pedido se creó bien. No tiene un número de referencia para recoger.

**UX-2 · La página de éxito no muestra el ID del pedido**
`apps/app/app/checkout/success/page.tsx`

Incluso en el flujo de Stripe, la página de éxito celebra con animación pero nunca muestra el ID o número de pedido. El cliente llega al mostrador y no puede decir "soy el pedido #47".

→ El barista tiene que buscar por nombre, lo que ralentiza la entrega.

**UX-3 · Error boundary depende de LanguageProvider**
`apps/app/app/error.tsx` línea 18

El error global usa `useLanguage()`. Si el error fue precisamente en el LanguageProvider, el error boundary falla también → pantalla blanca.

→ El cliente ve una pantalla en blanco sin opción de recuperarse.

---

### ALTOS

**UX-4 · Errores de Firestore no se muestran al usuario**
`apps/app/app/orders/page.tsx` líneas 62-64

Si se cae la conexión con Firebase, el listener de órdenes tiene un handler de error que solo hace `console.error`. No hay mensaje en UI ni botón de reintentar.

→ La página de pedidos se queda vacía o en "cargando" para siempre.

**UX-5 · No hay manejo de expiración de sesión**
Todo el sistema de auth

No hay detección de token expirado. Si el usuario deja la app abierta y vuelve horas después, puede intentar hacer checkout y recibir "Error de autenticación" sin contexto.

→ El cliente pierde el carrito y no entiende qué pasó.

**UX-6 · Las redenciones no muestran fecha de expiración**
`apps/app/app/rewards/page.tsx` líneas 164-176

El usuario canjea una recompensa y ve el código, pero no cuándo expira. Los códigos duran 48h pero no se muestra eso.

→ El cliente canjea puntos y pierde la recompensa porque no sabía que expiraba.

**UX-7 · Accesibilidad: milk picker y status de pedidos sin aria-labels**
`apps/app/app/page.tsx` líneas 154-187, `orders/page.tsx` línea 146

Los botones del selector de leche y los iconos de estado de pedido no tienen labels para lectores de pantalla.

→ Usuarios con discapacidad visual no pueden usar el selector de leche ni ver el estado de sus pedidos.

---

### MEDIOS

**UX-8 · Toast de "añadido al carrito" dura 1.5 segundos**
`apps/app/app/page.tsx` línea 95

Muy rápido para usuarios móviles. Muchos no lo ven y no saben si se añadió.

**UX-9 · "Repetir pedido" no dice qué items ya no están disponibles**
`apps/app/app/orders/page.tsx` líneas 90-137

Dice "2 productos no disponibles" pero no cuáles. El usuario no sabe qué falta.

**UX-10 · Página offline con idioma hardcoded**
`apps/app/app/offline/page.tsx`

Si el idioma está en inglés, la página offline muestra español por defecto.

**UX-11 · Sin foco de teclado después de cerrar modales**
`apps/app/app/page.tsx` líneas 154-187

Al cerrar el selector de leche, el foco salta al inicio de la página en vez de volver al producto.

---

## POS (lo que ven los baristas)

### CRÍTICOS

**UX-12 · Sin capacidad offline**
Todo el POS depende de Firestore online

Si se cae el WiFi durante hora punta, el POS no puede: añadir items, procesar pagos, ni generar tickets. Todo el servicio se bloquea.

→ Cola de clientes sin poder cobrar.

**UX-13 · Sesión expira sin aviso y pierde el pedido en curso**
`apps/pos/src/contexts/simple-auth-context.tsx`

Después de ~1 hora, el token expira. No hay refresh automático ni aviso. El barista pierde todo lo que tenía en pantalla.

→ Pedido complejo perdido en medio del servicio.

**UX-14 · Sin protección contra clicks dobles en pago**
`apps/pos/src/components/pos/payment-method-modal.tsx`

El botón de pagar no se deshabilita ni muestra spinner después del primer click. En conexiones lentas, el barista pulsa dos veces y se generan dos tickets.

→ Tickets duplicados, cuadre de caja descuadrado.

---

### ALTOS

**UX-15 · Modal de pago con demasiados pasos**
`apps/pos/src/components/pos/payment-method-modal.tsx`

Para cobrar, el barista tiene que: elegir método → clasificar cliente (frecuencia, rol) → confirmar. Son 15-20 segundos extra por ticket.

→ En hora punta, esto suma minutos de cola.

**UX-16 · Historial de tickets sin paginación**
`apps/pos/src/app/recibos/page.tsx`

Carga TODOS los tickets de golpe. Con meses de ventas (5000+ tickets), la UI se congela.

→ Página de recibos inutilizable después de unos meses.

**UX-17 · Búsqueda de clientes carga todos sin límite**
POS customer search

Carga todos los estudiantes/clientes sin paginación ni debounce.

→ Con 500+ clientes, la búsqueda tarda segundos.

**UX-18 · Mensajes de error de loyalty crípticos**
Validador de canjes

Errores como "INSUFFICIENT_BALANCE" o "EXPIRED" sin traducir a lenguaje humano.

→ El barista no sabe explicarle al cliente por qué no funciona su canje.

---

### MEDIOS

**UX-19 · Undo de item expira a los 30 segundos**
Debería ser más tiempo en un entorno POS donde el barista está ocupado.

**UX-20 · Pedidos de la app no se refrescan automáticamente**
Panel de pedidos APP en el POS sin real-time listener.

→ El barista tiene que refrescar manualmente para ver pedidos nuevos.

---

## BRAIN (lo que ve el admin/gestor)

### CRÍTICOS

**UX-21 · Errores de API silenciosos en el dashboard**
`apps/brain/app/page.tsx` líneas 87-95

Todos los fetch que fallan solo hacen console.log. El admin ve "Cargando..." eternamente o datos parciales sin saber que faltan.

→ Decisiones tomadas con datos incompletos.

**UX-22 · Formularios de creación no previenen duplicados**
`NewRecipeForm.tsx`, `NewCatalogForm.tsx`, etc.

Solo el botón se deshabilita, no los campos. Click doble en guardado crea duplicados.

→ Recetas, SKUs o proveedores duplicados en la base de datos.

**UX-23 · Confirmación de borrado genérica**
`apps/brain/app/page.tsx` líneas 138-186

Usa `confirm("¿Borrar esta receta?")` sin mostrar el nombre del item ni advertir sobre dependencias.

→ Admin borra accidentalmente una receta que usan 10 productos.

---

### ALTOS

**UX-24 · Sin paginación ni búsqueda en tablas**
Productos, recetas, SKU Master, rewards

Todas las tablas renderizan TODOS los registros. Sin campo de búsqueda de texto.

→ Con 200+ productos, encontrar uno específico requiere scroll manual.

**UX-25 · Control Tower demasiado denso**
`apps/brain/app/control-tower/page.tsx`

5 KPI cards + fuentes de puntos + canjes + reconciliación + expiración, todo en una sola página sin secciones claras.

→ El admin no sabe por dónde empezar. Información abrumadora.

**UX-26 · Expiración masiva de canjes sin preview**
Control Tower

Un solo botón que expira 1200+ redemptions sin mostrar una lista previa de lo que se va a expirar.

→ Riesgo de expirar canjes que todavía son válidos.

---

### MEDIOS

**UX-27 · Subida de facturas sin indicador de progreso**
OCR processing

Muestra "Procesando..." sin barra de progreso. Procesamiento de 2 min parece crash.

**UX-28 · Modales sin botón de cerrar**
NewRecipeForm, NewCatalogForm

Solo se cierran haciendo click fuera. No hay X ni botón "Cancelar".

→ Usuarios no técnicos no descubren cómo cerrar.

**UX-29 · Datos de loyalty no se refrescan en tiempo real**
Control Tower carga datos una vez. No hay auto-refresh.

→ Métricas desfasadas durante el día.

**UX-30 · Estados vacíos inconsistentes**
Algunas secciones muestran mensaje amigable ("Aún no tienes SKUs..."), otras muestran pantalla en blanco.
