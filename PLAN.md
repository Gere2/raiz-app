# PLAN · Raíz y Grano

Estado del proyecto y dirección de los próximos pasos. Si lees esto y notas
que está obsoleto, edítalo. Es el único documento "vivo" de planning. Todo lo
demás está en `docs/archive/`.

Última actualización: 2026-05-08

---

## 1. Qué es Raíz y Grano (1 línea)

Food truck / cafetería de especialidad en campus universitario UFV (Madrid).
Sociedad: Eurosirius SL. Operador único: Geremi.

## 2. Estado del negocio (lectura del Treasury Truth Layer)

Datos enero–7 mayo 2026 (542 movimientos bancarios, BBVA 4850 + Santander 8859):

| Mes  | Ventas TPV | Caja      | Económico c/sueldo 1k |
|------|-----------:|----------:|----------------------:|
| Ene  | 2.857 €    | +1.615 €  | +1.906 € 🟢            |
| Feb  | 6.482 €    |    -62 €  |   +175 € 🟡            |
| Mar  | 8.722 €    | -1.716 €  |   +305 € 🟡            |
| Abr  | 9.281 €    | +1.598 €  |  +1.405 € 🟢 (con 1k) |
| May (parc.) | 2.461 € | -1.399 € | +129 €               |

Volumen TPV estable en ~8.700 €/mes. **Sueldo Geremi sostenible: 1.000 €/mes**.
Para 1.500 € sostenido faltan ~10 tickets/día extra (~1.500 €/mes ventas).

Issues abiertos en datos:
- 3.000 € enero "anticipo administrador eurosirius" sin contraparte (Santander
  no tiene enero, mientras se ignore el warning).
- Tarjetas 9415 y 2288 acumulan ~2.500 € sin desglose → bloquea food cost real.
- CFO summaries en cache son stale tras los re-ingestes — regenerar cuando
  haga falta con `treasury-cfo-summary.mjs <mes> --regenerate`.

## 3. Sistemas dentro del Brain (15 secciones, agrupadas)

```
OPERACIONES (lo que uso para decidir HOY)
  ├─ HomeSection          – KPIs y vista general
  ├─ TreasurySection      – Treasury Truth Layer (PR1→PR8 cerrados)
  ├─ MarginsSection       – márgenes por producto
  └─ InventorySection     – stock y movimientos

PRODUCTO (catálogo, mantenimiento bajo)
  ├─ Recipes / Escandallos
  ├─ MeetingCombosSection
  ├─ SeasonalRecipesSection
  ├─ StagingSection
  └─ OrgConfigSection

CLIENTES (gamificación + CRM, 5 secciones para algo que es UNA cosa)
  ├─ CustomersSection
  ├─ RewardsSection
  ├─ QuizzesSection
  ├─ MissionsSection
  └─ EventsSection

SISTEMA
  ├─ PosLinkSection
  ├─ ReportsSection
  └─ Suppliers / Packaging / SKUs / Catalog
```

## 4. Treasury Truth Layer (lo último que se construyó)

Ver `ARCHITECTURE.md` para el detalle técnico. Resumen:

- **PR1–PR1.5**: Schema, reglas determinísticas, parser CSV multi-banco.
- **PR2**: Detector de traspasos internos Santander↔BBVA.
- **PR3**: Agregador mensual caja vs económico.
- **PR4**: Accruals + assumptions por mes + economicMonth manual.
- **PR5**: Semáforo + sueldo posible + tickets extra + escenarios.
- **PR7**: UI Panel de Verdad en TreasurySection.
- **PR8**: Resumen CFO/CEO automático con Claude + caching.
- **Pendiente**: PR6 (vista facturas pendientes), PR9 (tests vitest cuando se
  arregle el binding de rolldown).

## 5. Lo que NO se hace ahora

- ❌ PR6 ni PR9 — no son bloqueantes para tomar decisiones.
- ❌ Más features nuevas en otras secciones.
- ❌ Refactor interno por estética.
- ❌ Más documentos de planning.

## 6. Lo que sí podría tocar (priorizado)

1. **Limpieza táctica** (en curso, mayo 2026) — reorganizar menú del Brain
   en 4 grupos, esconder secciones que no se usan semanalmente.
2. **Encapsular flujos CLI en botones de UI** — los 18 scripts de tesorería
   tienen más capacidad que la UI; un par de botones bien puestos eliminan
   la deuda cognitiva.
3. **Subir extractos detallados de tarjetas 9415 y 2288** — desbloquea food
   cost real.

## 7. Backlog técnico — decisiones tomadas, pendientes de ejecutar

### Staging → migrar a lib/treasury/invoice-matcher.ts
**Decisión tomada**: 2026-05-08

`StagingSection` + el servicio Python `singularidad-engine/brain/invoices/`
proporcionan un pipeline de facturas con reconciliación factura↔movimiento
bancario. Solapa al 80% con Treasury Truth Layer (extracción IA, reglas,
clasificación) y el propio autor marcó `treasury.py` como deprecated en
favor de `raiz-app's Firestore`.

**Acción tomada hoy**: Staging se ha movido a `EXPERIMENTAL_SECTIONS` y
queda oculto del menú principal. El servicio Python NO se arranca.

**Acción futura (cuando aporte valor)**: escribir
`apps/brain/lib/treasury/invoice-matcher.ts` reutilizando el patrón de
`transfer-detector.ts`:

- Carga facturas desde `orgs/{orgId}/suppliers/{supplierId}/invoices`
- Carga movimientos `bank_movements` del rango
- Empareja por bucket de importe + ventana de fechas + supplierName fuzzy
- Devuelve `{ strongPairs, ambiguous }` como el detector de transfers
- Endpoint `POST /api/.../treasury/invoice-matcher/detect`
- Escribe `bank_movement.invoiceRef` en pares strong (back-link)
- Sin SQLite externo, sin servicio Python

Estimación: ~200 líneas de TS + endpoint + smoke test. 1-2 horas.

Cuando se ejecute, **borrar definitivamente el repo `singularidad-engine`**
(o al menos su carpeta `brain/invoices/`) para cerrar la deuda.

## 8. Cómo trabajar este proyecto

- Una sola fuente de verdad: este archivo. Si cambia el plan, edítalo.
- `docs/archive/` es histórico — referencia, no autoridad.
- Decisiones técnicas viven en commits y en `ARCHITECTURE.md`.
- Si una sección no se ha tocado en 30 días y no se usa: marcarla
  experimental u ocultarla del menú principal.
