# Brain + Escandallos — Guía de Implementación

> Para: Gere (Raíz y Grano)
> Fecha: 19 Feb 2026
> De: Claude

---

## 🚨 URGENTE: Rotar Private Key

Tu documento contiene la **private key completa** del service account `raizygrano-admin.json`.
Cualquiera con esa clave tiene acceso **total** a tu Firebase (Firestore, Auth, Storage...).

**Acción inmediata:**
1. Ve a [GCP Console → IAM → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=raizygrano)
2. Selecciona `firebase-adminsdk-fbsvc@raizygrano.iam.gserviceaccount.com`
3. Pestaña **Keys** → **Add Key** → **Create new key** → JSON
4. Descarga el nuevo JSON y guárdalo en `apps/pos/secrets/raizygrano-admin.json`
5. **Borra la key vieja** (la que tiene `private_key_id: 54d4bd8b...`)
6. Actualiza `.env.local` si usabas `FIREBASE_ADMIN_JSON`

---

## 🔍 Diagnóstico de Problemas

### 1. `lib/firebase-admin.ts` — versiones inconsistentes
El archivo se reescribió varias veces con APIs diferentes:
- Versión A: exportaba `getAdmin()` (función)
- Versión B: exportaba `db` directamente
- Versión C: usaba `cert()` con JSON file
- Versión D: usaba `applicationDefault()`

**Solución:** Un solo archivo que prueba ambas estrategias (credentials file ó JSON inline).

### 2. `lib/require-auth.ts` — no existía
Cuando se crearon las rutas de `tasks`, importaban `@/lib/require-auth` que no existía.

**Solución:** Archivo dedicado con clase `AuthError` y función `requireAuth()`.

### 3. Auth popup vs redirect
Se alternó entre `signInWithPopup` y `signInWithRedirect` múltiples veces.
El redirect requiere `consumeRedirectResult()` al montar, que se olvidó.

**Solución:** Popup primero, redirect como fallback si popup está bloqueado.
`consumeRedirectResult()` exportado y disponible.

### 4. `page.tsx` monolítica (~430 líneas)
Todo el UI (login, orgs, notes, tasks, recipes, catalog, ingredients) en un solo archivo
con `prompt()` como input. Imposible de mantener.

**Solución:** Separar en componentes y páginas por feature.

---

## 📁 Estructura de Archivos

```
apps/brain/
├── lib/
│   ├── firebase.ts          # Client SDK (auth, firestore) ← LIMPIAR
│   ├── firebase-admin.ts    # Admin SDK (server-side) ← REEMPLAZAR
│   ├── auth-client.ts       # Google auth helpers ← REEMPLAZAR
│   ├── authed-fetch.ts      # fetch con Bearer token ← NUEVO
│   └── require-auth.ts      # Middleware auth API ← REEMPLAZAR
├── app/
│   ├── layout.tsx           # (mantener el actual)
│   ├── page.tsx             # Login + org selector (simplificar)
│   └── api/org/[orgId]/
│       ├── catalog/
│       │   └── route.ts     # GET + POST catálogo
│       ├── recipes/
│       │   ├── route.ts     # GET + POST recetas
│       │   └── [recipeId]/
│       │       ├── route.ts # GET + PATCH + DELETE receta
│       │       └── ingredients/
│       │           ├── route.ts          # GET + POST ingredientes
│       │           └── [ingredientId]/
│       │               └── route.ts      # PATCH + DELETE ingrediente
│       ├── notes/           # (mantener existente)
│       └── tasks/           # (mantener existente)
└── components/              # (futuro: extraer UI de page.tsx)
```

---

## 🔧 Cómo Aplicar los Archivos

### Paso 1: Copiar lib/
```bash
cd ~/raiz-app/apps/brain

# Backup
cp lib/firebase-admin.ts lib/firebase-admin.ts.bak
cp lib/require-auth.ts lib/require-auth.ts.bak 2>/dev/null
cp lib/auth-client.ts lib/auth-client.ts.bak

# Copiar archivos nuevos (usa heredoc o copia desde los archivos adjuntos)
```

### Paso 2: Crear rutas API
```bash
cd ~/raiz-app/apps/brain

# Las rutas de catalog y recipes ya deberían existir parcialmente.
# Reemplaza con las versiones limpias.

# Crear directorio para ingrediente individual:
mkdir -p "app/api/org/[orgId]/recipes/[recipeId]/ingredients/[ingredientId]"
```

### Paso 3: Verificar
```bash
cd ~/raiz-app/apps/brain
rm -rf .next
npm run dev

# Deberías ver:
# GET /api/org/raiz_y_grano/catalog 200
# GET /api/org/raiz_y_grano/recipes 200
```

---

## 📊 Modelo de Datos Firestore

### `orgs/{orgId}/catalog/{itemId}`
```typescript
{
  name: "Café espresso blend",
  baseUnit: "g",           // unidad mínima de costeo
  packQty: 1000,           // cuántas baseUnit por pack
  packUnit: "kg",          // nombre del pack
  packCost: 18.50,         // € por pack
  unitCost: 0.0185,        // € por baseUnit (auto-calculado)
  supplier: "Cafés Lúa",
  createdBy: "uid...",
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### `orgs/{orgId}/recipes/{recipeId}`
```typescript
{
  name: "Café Latte",
  yieldQty: 1,
  yieldUnit: "taza",
  sellingPrice: 3.50,       // PVP
  totalCost: 0.709,         // suma de lineCost de ingredientes
  foodCostPct: 20.26,       // (totalCost / sellingPrice) × 100
  createdBy: "uid...",
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### `orgs/{orgId}/recipes/{recipeId}/ingredients/{ingId}`
```typescript
{
  catalogItemId: "c1",
  name: "Café espresso blend",  // snapshot del nombre
  qty: 18,                       // cantidad del usuario
  unit: "g",                     // unidad del usuario
  baseQty: 18,                   // qty convertida a baseUnit
  baseUnit: "g",
  unitCost: 0.0185,             // snapshot del coste unitario
  lineCost: 0.333,              // baseQty × unitCost
  createdBy: "uid...",
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

---

## 🔗 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/org/{orgId}/catalog` | Lista catálogo |
| POST | `/api/org/{orgId}/catalog` | Crear artículo catálogo |
| GET | `/api/org/{orgId}/recipes` | Lista recetas |
| POST | `/api/org/{orgId}/recipes` | Crear receta |
| GET | `/api/org/{orgId}/recipes/{id}` | Detalle receta + ingredientes + totales |
| PATCH | `/api/org/{orgId}/recipes/{id}` | Actualizar PVP / nombre |
| DELETE | `/api/org/{orgId}/recipes/{id}` | Borrar receta + ingredientes |
| GET | `/api/org/{orgId}/recipes/{id}/ingredients` | Lista ingredientes |
| POST | `/api/org/{orgId}/recipes/{id}/ingredients` | Añadir ingrediente (desde catálogo) |
| PATCH | `/api/org/{orgId}/recipes/{id}/ingredients/{iid}` | Cambiar cantidad |
| DELETE | `/api/org/{orgId}/recipes/{id}/ingredients/{iid}` | Borrar ingrediente |

Todos requieren header: `Authorization: Bearer <firebase-id-token>`

---

## 🎯 Próximos Pasos

1. **Rotar la private key** (urgente)
2. Copiar los archivos `lib/` y rutas `api/`
3. Extraer la UI de `page.tsx` en componentes separados
   (el artifact React que te envié puede servir de referencia para el diseño)
4. Conectar las recetas del Brain con los productos del POS
   (vincular `recipe.productId` → `products/{id}`)
5. Dashboard de márgenes: vista resumen de food cost por categoría
