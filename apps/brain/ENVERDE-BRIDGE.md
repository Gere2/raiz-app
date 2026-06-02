# Puente enverde ↔ brain — Contrato de integración (T0)

> Estado: **contrato acordado**. Implementación en T1 (brain) y T3 (enverde).
> Objetivo: que el funnel de enverde (`/probar/cfo-cafeteria-especialidad`) provisione
> una org nueva en el brain y deje al café autenticado en "sube tu extracto → tu sueldo".

## 1. Por qué un puente (y no un login normal)

`marketplace`/enverde y `raiz-app`/brain son **dos proyectos Firebase distintos**
(`raizygrano` es el del brain). Un Firebase **ID token** de enverde **no** valida
contra `adminAuth.verifyIdToken` del brain (otra audiencia, otras claves).

Por eso el puente tiene **dos planos**:

1. **Provisión server-to-server** (enverde server → brain server) protegida por **secreto
   compartido**. Crea/asegura la org y siembra assumptions. No usa token de usuario.
2. **Bridge de identidad** vía **Firebase custom token**: el brain (proyecto `raizygrano`)
   firma un custom token para el `uid` del café; el cliente lo canjea con
   `signInWithCustomToken` → obtiene un ID token de `raizygrano` → ya puede llamar a las
   rutas `org/[orgId]/...` con `Authorization: Bearer`.

```
[café completa /probar]
        │  (server, Admin SDK)
        ▼
enverde  ──POST /api/enverde/provision (x-enverde-secret)──►  brain
        ◄──────── { orgId, customToken } ───────────────────
        │
        ▼  redirect 302
brain /enverde-login?token=<customToken>&org=<orgId>&next=/org/<orgId>/treasury/start
        │  signInWithCustomToken(token)  → ID token raizygrano
        ▼
brain  /org/<orgId>/treasury/start   (sube extracto → monthly-summary → sueldo)
```

## 2. Identidad: quién genera qué

- **enverde genera `orgId`** (slug único: `slug(orgName)-<rand6>`). Lo guarda en su
  Firestore (CRM de cafeterías) junto al email del café para reconocer revisitas.
- **El brain deriva el `uid`** como `uid = "enverde_" + orgId`. enverde **no** controla
  uids crudos → imposible colisionar con usuarios reales de `raizygrano` (p. ej. Geremi).
- La org es **idempotente**: re-provisionar el mismo `orgId` no duplica (usa `merge` +
  `ensureDefaultAssumptions` que comprueba existencia).

## 3. Endpoint de provisión (lo implementa T1 en el brain)

`POST /api/enverde/provision`

**Auth:** header `x-enverde-secret: <ENVERDE_PROVISION_SECRET>` (comparación en tiempo
constante). Sin secreto válido → `401`. El secreto vive solo en env de servidor en ambos
lados; **nunca** se expone al cliente.

**Request body (JSON):**

```jsonc
{
  "orgId":       "cafe-luna-madrid-x7k2",   // requerido, slug [a-z0-9-], 3..64
  "orgName":     "Café Luna",                // requerido, 1..80
  "email":       "hola@cafeluna.es",         // requerido (para el perfil/contacto)
  "founderName": "Marta",                     // opcional → usado en el prompt CFO
  "businessType":"cafetería de especialidad", // opcional → descripción en el prompt
  "salaryTarget": 1500                         // opcional → foundersSalaryTarget (_default)
}
```

**Respuesta `200`:**

```jsonc
{
  "ok": true,
  "orgId": "cafe-luna-madrid-x7k2",
  "uid": "enverde_cafe-luna-madrid-x7k2",
  "customToken": "<firebase custom token raizygrano>",
  "loginUrl": "/enverde-login?token=<customToken>&org=<orgId>&next=%2Forg%2F<orgId>%2Ftreasury%2Fstart"
}
```

Errores: `401` (secreto), `400` (validación), `500` (server). Respuesta de error:
`{ "error": "<mensaje>" }`.

**Efectos en Firestore (Admin SDK):**
- `orgs/{orgId}` ← `{ name, founderName, email, businessType, source: "enverde", createdAt }` (merge)
- `orgs/{orgId}/members/{uid}` ← `{ role: "owner", active: true, source: "enverde", createdAt }` (merge)
- `ensureDefaultAssumptions(orgId)` (siembra `treasury_assumptions/_default`)
- si `salaryTarget` → `upsertAssumption(orgId, "_default", { foundersSalaryTarget })`

## 4. Perfil CFO (lo consume T2)

El `orgs/{orgId}` gana campos de perfil que des-Raíz-ifican el prompt:

| Campo            | Origen                    | Uso en `cfo-summary.ts`            |
|------------------|---------------------------|------------------------------------|
| `name`           | provisión (`orgName`)     | nombre del negocio en el prompt    |
| `founderName`    | provisión                 | a quién tutea / "sueldo de …"      |
| `businessType`   | provisión                 | descripción del negocio            |
| `foundersSalary*`| `treasury_assumptions`    | sueldo por defecto / objetivo      |
| `foodCostTarget` | `treasury_assumptions`    | umbrales del semáforo              |

Raíz y Grano conserva su comportamiento **idéntico** porque T2 usa un `RAIZ_PROFILE` por
defecto cuando no llega perfil de org (back-compat: la org `raiz_y_grano` no tiene estos
campos nuevos y cae al default Raíz).

## 5. Variables de entorno nuevas

| Variable                  | Dónde            | Qué es                                            |
|---------------------------|------------------|---------------------------------------------------|
| `ENVERDE_PROVISION_SECRET`| brain + enverde  | secreto compartido del endpoint de provisión      |
| `BRAIN_BASE_URL`          | enverde          | base del brain (p. ej. `https://brain.raizygrano.com`) |
| `NEXT_PUBLIC_BRAIN_URL`   | enverde          | misma base, para construir el redirect del cliente |

## 6. Seguridad

- Secreto comparado en **tiempo constante** (evita timing attacks).
- `uid` siempre namespaced `enverde_*` → sin colisión con usuarios reales.
- El endpoint **no** acepta `uid` del caller (lo deriva del `orgId`).
- Custom token con claims `{ enverde: true, orgId }` y caducidad estándar (1 h); el café
  re-entra desde enverde si caduca (re-provisión idempotente).
- **Gate Fase 2 (no en T0–T5):** auditar que toda ruta `org/[orgId]` valida
  `requireOrgMember` (cero fuga cross-org), porque es la misma instancia que Raíz y Grano.
  Nota: hoy `treasury/extract` y `treasury/monthly-summary` usan solo `requireAuth`
  (no `requireOrgMember`) — el café de enverde solo llama a SU orgId, pero endurecer
  esto es lo primero de Fase 2 antes de escalar.

## 7. T5 — Marca: servir el brain bajo `app.enverde.app`

Para que el café nunca vea "raizygrano" en la barra de direcciones, el brain se
sirve bajo un dominio de enverde. El código ya lo soporta vía env (sin tocar nada):

- **enverde** (`/api/enverde/start`): la llamada server-to-server usa `BRAIN_BASE_URL`
  (interno, p. ej. `https://brain.raizygrano.com`), pero el **redirect del café** usa
  `BRAIN_PUBLIC_URL` si está definida. Pon `BRAIN_PUBLIC_URL=https://app.enverde.app`.

- **DNS/Vercel** (acción de panel, una vez):
  1. En el proyecto Vercel del **brain** (raiz-app): añadir el dominio `app.enverde.app`.
  2. En el panel DNS de **Don Dominio** (enverde.app): `app` CNAME → `cname.vercel-dns.com`.
  3. El brain responde en `app.enverde.app` con su cert. La auth funciona igual:
     `signInWithCustomToken` es directo (sin redirect), así que sirve en cualquier
     dominio mientras el Firebase config (raizygrano apiKey/projectId) sea correcto.

> No se usa rewrite/proxy de Next: proxyar una app Next entera por `rewrites` rompe
> los assets `_next/*` (quedan en el origen equivocado). CNAME directo al brain es
> robusto y sin sorpresas.

