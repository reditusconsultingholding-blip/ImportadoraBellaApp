# Fuentes de conocimiento y handover técnico — Jarvis

**Qué es:** el panel operativo de Importadora Bella (ecommerce de contraentrega en Ecuador). Junta ventas de Shopify, pauta de Meta y TikTok, el control publicitario, el flujo de contenido creativo, nómina y un asistente de IA.
**Producción:** https://jarvisecom.com
**Repositorio:** https://github.com/reditusconsultingholding-blip/ImportadoraBellaApp (rama `main` = producción)
**Desarrollado por:** Reditus Consulting
**Última revisión:** 19 de septiembre de 2026

Otros documentos de la carpeta `docs/`:

| Documento | Qué tiene |
|---|---|
| `MANUAL_DE_USO.md` | Manual para el equipo: operación de ventas, contenido y solución de problemas. |
| `DECISIONES.md` | Por qué se hizo cada cosa como está. **Léelo antes de "arreglar" algo que parece raro.** |
| `JARVIS_MASTER_REQUIREMENT_V2.md` | El requerimiento funcional completo del cliente. |
| `REFERENCIA_SISTEMA_RAILWAY.md` | El sistema anterior (FastAPI) del que se portaron patrones. |
| `../prisma/manual-sql/` | Todo cambio de esquema aplicado a mano en producción, fechado. |

---

## 1. Arquitectura y stack tecnológico

### 1.1 Vista general

```
                    ┌──────────── Name.com (DNS) ────────────┐
                    │  jarvisecom.com  ·  jarvisecom.world   │
                    └───────────────────┬────────────────────┘
                                        │ HTTPS
                          ┌─────────────▼─────────────┐
   Navegador del equipo ─►│  Railway · servicio jarvis │  Next.js 16 (frontend + API)
                          │  + reloj interno (5 min)   │──► Anthropic (IA)
                          └──┬──────────┬──────────┬───┘──► Resend (correo)
                             │          │          │    ──► Web Push (VAPID)
                  Prisma/pg  │   fetch  │   fetch  │
                             ▼          ▼          ▼
                 Supabase Postgres   Windsor.ai   Shopify Admin API
                  (us-east-1)        (Meta+TikTok)  (GraphQL/REST)
                                        │
                                  Notion API · Dropi (pendiente)
```

**No hay un backend aparte:** Next.js sirve las pantallas (React Server Components) y la API (`src/app/api/*`). Un **reloj interno** que corre dentro del mismo proceso sincroniza todo cada 5 minutos (`src/lib/scheduler.ts`, arrancado desde `src/instrumentation.ts`). Dos servicios cron de Railway quedan como respaldo.

### 1.2 Frameworks y librerías

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Framework | **Next.js** (App Router, Turbopack) | 16.3.5 | `src/middleware.ts` = "Proxy" en Next 16. |
| UI | **React** | 19.2 | Server Components por defecto; `"use client"` solo donde hay interacción. |
| Estilos | **Tailwind CSS** | 4 | Tokens de color en `src/app/globals.css`. |
| Lenguaje | **TypeScript** | 5 | Estricto. |
| ORM | **Prisma** + `@prisma/adapter-pg` | 7.8 | Cliente generado en `src/generated/prisma/` (no se commitea). |
| Base de datos | **PostgreSQL 17** en **Supabase** | — | Por el pooler de transacciones (puerto 6543). |
| Sesión | **jose** (JWT HS256 en cookie httpOnly) | 6 | 30 días, revocable por `User.sessionVersion`. |
| Claves | **bcryptjs** | 3 | Costo 10. |
| Validación | **Zod** | 4 | `src/lib/validacion.ts`. |
| Gráficos | **Recharts** | 3 | |
| PDF | **pdfkit** | 0.19 | Reportes diarios; va como paquete externo (ver `next.config.ts`). |
| IA | **@anthropic-ai/sdk** | 0.112 | Chat de Jarvis y análisis del panel. |
| Push | **web-push** | 3.6 | Notificaciones del navegador (VAPID). |
| Pruebas | **node:test** + **tsx** | Node 24 | `npm test`. Sin dependencias extra. |

### 1.3 Servicios externos (SaaS)

| Servicio | Para qué | Cómo se conecta | Código |
|---|---|---|---|
| **Supabase** | Base de datos Postgres | `DATABASE_URL` | `src/lib/db.ts` |
| **Railway** | Hosting de la app y crons de respaldo | Deploy automático desde GitHub `main` | — |
| **Windsor.ai** | **Única fuente de Meta Ads y TikTok Ads.** Windsor tiene el permiso sobre las cuentas publicitarias; Jarvis le pide los datos con una API key. | `WINDSOR_API_KEY` | `src/lib/integrations/windsor*.ts` |
| **Shopify Admin API** | Órdenes, renglones, clientes y catálogo | App "Jarvin Panal" del Dev Dashboard (client credentials) | `src/lib/integrations/shopify*.ts` |
| **Notion API** | Tareas diarias y responsables de producto (base *PRODUCTOS ORDEN*) | Integration token, guardado **cifrado** en la base | `src/lib/integrations/notion*.ts` |
| **Anthropic** | Motor del chat de Jarvis y los análisis | `ANTHROPIC_API_KEY` | `src/lib/agent.ts`, `src/lib/insights.ts` |
| **Resend** | Correos: reporte diario y semanal, alertas | `RESEND_API_KEY` + dominio verificado | `src/lib/email.ts` |
| **Web Push** | Notificaciones en el navegador | Par VAPID propio | `src/lib/push.ts` |
| **Dropi** | Logística (torre logística) | Integration key — **pendiente de que Dropi la habilite** | `src/app/api/dropi` |
| **Name.com** | Registro y DNS de los dominios | Panel de Name.com | — |

**Meta Graph API / TikTok Business API directas:** el código (`src/lib/integrations/meta.ts`, `tiktok.ts`) existe para conectar cuentas con token propio, pero **hoy no se usa**: todo entra por Windsor. No hace falta una app en Meta for Developers ni en TikTok for Business mientras se siga con Windsor.

**Almacenamiento de archivos:** Jarvis **no guarda videos ni imágenes**. Las piezas guardan links (Google Drive u otro). Las fotos de perfil son miniaturas de hasta 300 KB guardadas en la base. No hay bucket ni CDN que mantener.

### 1.4 Seguridad (resumen de lo que está en el código)

| Defensa | Dónde |
|---|---|
| Sesión JWT httpOnly + Secure + SameSite=Lax; rol releído de la base en cada pedido; revocable | `src/lib/auth.ts` |
| Chequeo de Origin en toda mutación de `/api` (anti-CSRF) y sin clave de respaldo en producción | `src/middleware.ts` |
| Permisos por rol (`canManagePipeline`, `canManageConexiones`, `veLasCifras`, nómina) | `src/lib/permissions.ts`, `src/lib/payroll-access.ts` |
| Tokens de terceros cifrados en reposo (AES-256-GCM), de forma transparente | `src/lib/cifrado.ts`, `src/lib/db.ts` |
| Límite de frecuencia (login, IA, correo, conexiones) | `src/lib/limite.ts` |
| Validación de cuerpos (Zod) | `src/lib/validacion.ts` |
| Cron con secreto en tiempo constante; falla cerrado | `src/lib/cron-auth.ts` |
| Dominio de Shopify validado (anti-SSRF) | `normalizeShopDomain` en `src/lib/integrations/shopify.ts` |
| Encabezados de seguridad (HSTS, frame-ancestors, nosniff…) | `next.config.ts` |
| RLS activo en todas las tablas + trigger que lo activa en las nuevas | `prisma/manual-sql/2026-09-19-auditoria.sql` |

---

## 2. Matriz de accesos e integraciones

Todas las cuentas que hacen falta para operar el sistema. **Los valores secretos no van en este documento ni en el repositorio**: viven en las variables de Railway y en los paneles de cada servicio.

| # | Servicio | Qué se administra ahí | Cuenta / proyecto | Variables en Railway | Estado |
|---|---|---|---|---|---|
| 1 | **GitHub** | Código fuente | Org `reditusconsultingholding-blip`, repo `ImportadoraBellaApp` | — | ✅ |
| 2 | **Railway** | Hosting, variables de entorno, logs, crons | Proyecto `importadora-bella-jarvis`, servicio `jarvis` (+ `cron-sync`, `cron-reporte-diario`) | Todas | ✅ |
| 3 | **Supabase** | Base de datos, backups, SQL | Org "Jarvis - Importadora Bella", proyecto `pqlchgdwvjuyuknyexpe` (us-east-1) · **plan Free** | `DATABASE_URL` | ✅ (ver backups en §4) |
| 4 | **Name.com** | Dominios `jarvisecom.com` y `jarvisecom.world`, DNS | Cuenta de Reditus | — | ✅ Vence **2027-09-03** |
| 5 | **Windsor.ai** | Conexión con las cuentas de Meta Ads y TikTok Ads | Cuenta de la empresa | `WINDSOR_API_KEY` | ⚠️ Faltan 5 cuentas de TikTok |
| 6 | **Shopify** | Tienda `9edb78-80.myshopify.com`; app "Jarvin Panal" en el **Dev Dashboard** (no Partner Center) | Staff con permiso de apps | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION` | ✅ |
| 7 | **Notion** | Integración interna con acceso a las bases de tareas y *PRODUCTOS ORDEN* | Workspace de Importadora Bella | — (token cifrado en la base; se conecta desde *Conexiones*) | ✅ |
| 8 | **Anthropic** | API key y facturación de la IA | console.anthropic.com | `ANTHROPIC_API_KEY` | ✅ |
| 9 | **Resend** | Envío de correos; dominio verificado por DNS en Name.com | resend.com | `RESEND_API_KEY`, `EMAIL_FROM_DOMAIN` | ⚠️ **Ningún dominio tiene todavía los registros DNS de Resend** (DKIM/SPF): hay que agregarlos en Name.com. Sin eso, los correos solo le llegan al dueño de la cuenta de Resend. |
| 10 | **Web Push** | Par de claves VAPID (se generan una vez) | — | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | ✅ |
| 11 | **Dropi** | Integration key para la torre logística | Cuenta Dropi de la empresa | — (se carga desde *Conexiones*) | ⏳ Dropi no la habilitó aún |
| 12 | **Meta for Developers / TikTok for Business** | Solo si algún día se deja Windsor | — | — | No se usa |

**Variables propias de Jarvis** (no vienen de un tercero; se generan con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`):

| Variable | Qué protege | Si se cambia… |
|---|---|---|
| `SESSION_SECRET` | Firma de las sesiones | Se cierran todas las sesiones. |
| `ENCRYPTION_KEY` | Cifrado de los tokens de terceros en la base | **No cambiarla una vez cargada**: los tokens guardados quedan ilegibles y hay que reconectar Notion, Shopify y Dropi. |
| `CRON_SECRET` | Endpoints `/api/cron/*` | Actualizarla también en los dos servicios cron de Railway. |
| `USER_CREATION_TOTP_SECRET` | Código rotativo para crear usuarios | Se reconfigura la app autenticadora. |

La lista completa y comentada está en `.env.example`.

---

## 3. Guía para un nuevo programador

### 3.1 Levantar el proyecto en local

**Requisitos:** Node 24, npm, Git y acceso de lectura al repo.

```bash
git clone https://github.com/reditusconsultingholding-blip/ImportadoraBellaApp.git
cd ImportadoraBellaApp
npm install            # corre `prisma generate` solo (postinstall)
cp .env.example .env   # y completar, ver abajo
npm run dev            # http://localhost:3000
```

**`.env` mínimo para desarrollar:**

| Variable | De dónde |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (Transaction). **Hoy existe una sola base, la de producción**: ver la advertencia de abajo. |
| `SESSION_SECRET` | Cualquier valor aleatorio propio. |
| `ANTHROPIC_API_KEY` | Solo si vas a tocar el chat o los análisis. |

`WINDSOR_API_KEY`, las de Shopify y las de Resend **solo están en Railway**. Sin ellas la app levanta igual: esas sincronizaciones no corren y los correos no salen.

> ⚠️ **No hay base de staging.** `npm run dev` apunta a la base de producción. Por eso el reloj (las sincronizaciones y los avisos al equipo) **está apagado en desarrollo**: solo se enciende con `RELOJ_EN_DESARROLLO=1`, y no hay que hacerlo contra producción. Tampoco se corre código que escriba en tablas de secretos (`NotionConnection`, `ShopifyStore`, `AdAccount`, `DropiConnection`) desde local: el cifrado usaría tu `SESSION_SECRET` local y producción no podría leer el token. Crear una base de staging está entre las recomendaciones (§4.3).

### 3.2 Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack). |
| `npm run build` | Compilación de producción: typecheck incluido. Correrlo antes de cada push. |
| `npm run lint` | ESLint. |
| `npm test` | 30 pruebas de regresión (`tests/`): fórmulas del control, calculadora, atribución, estados de contenido, seguridad. |
| `npx prisma generate` | Regenera el cliente tras cambiar `schema.prisma`. |

### 3.3 Cambios de esquema (migraciones)

**No se usa `prisma migrate` contra producción** y no hay carpeta `prisma/migrations`. El procedimiento es:

1. Editar `prisma/schema.prisma`.
2. Generar el SQL de diferencia contra la base real:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
   (El `DROP/ADD FOREIGN KEY` de `ProductoShopify` que aparece siempre es ruido conocido: ignorarlo.)
3. **Leer el SQL.** Si tiene algo destructivo (`DROP COLUMN`, `DROP TABLE`, cambios de tipo), parar y pensarlo.
4. Guardarlo como `prisma/manual-sql/AAAA-MM-DD-tema.sql`, idempotente (`IF NOT EXISTS`).
5. Aplicarlo en Supabase (SQL Editor) **antes** de desplegar el código que lo usa.
6. `npx prisma generate`, build, commit y push.

### 3.4 Despliegue

- **Push a `main` = despliegue.** Railway compila y reemplaza el servicio en 2 a 4 minutos.
- Verificar con `https://jarvisecom.com/api/health`: `uptimeSeconds` vuelve a cero cuando entra la versión nueva, y `datosFrescos: true` indica que las sincronizaciones andan.
- Los logs están en Railway → servicio `jarvis` → Logs. Los errores no atrapados salen como una línea JSON con `"nivel":"error"` y un `digest`, que es el mismo código que ve el usuario en la pantalla de error.

### 3.5 Flujo de datos: de la venta a la pantalla

```
┌───────────────── cada 5 minutos: src/lib/scheduler.ts ─────────────────┐
│                                                                        │
│  0. recifrarPendientes()  → cifra tokens que hayan quedado en claro    │
│                                                                        │
│  1. SHOPIFY  syncShopifyStore()                src/lib/integrations/   │
│     Admin GraphQL: órdenes de los últimos 2 días (30 la primera vez)   │
│       → ShopifyOrder (upsert por storeId+externalId)                   │
│       → ShopifyOrderLineItem (borra y reescribe los renglones)         │
│                                                                        │
│  2. META / TIKTOK  syncWindsorConnector()                              │
│     Windsor.ai: gasto, impresiones, clics y compras, últimos 7 días    │
│       → AdAccount, Campaign (producto por el código del nombre:        │
│         "134142 / …"; lote por "134142-3")                             │
│       → MetricSnapshot (una fila por campaña y día; se reemplaza)      │
│                                                                        │
│  3. CONTROL  capturarCorte() / repasoDiarioDeCierres()                 │
│     pedidos reales (pedidos-reales.ts: un pedido = un producto)        │
│     + gasto de plataforma por día y producto                           │
│       → CortePublicitario (8, 11, 16 y 23 h) + CorteSinAsignar         │
│                                                                        │
│  4. NOTION  sincronizarNotion() → TareaDiaria, ResponsableProducto     │
│  5. Alertas, reporte diario (PDF), aviso de las 8, reporte semanal     │
│  6. Una vez por semana: repaso de 90 días de Meta y TikTok             │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
      Pantalla (Server Component) → src/lib/<módulo>.ts → Prisma → Postgres
      p. ej. /dashboard/control → controlDelPeriodo() → control-calculo.ts
```

**Convenciones de fechas (fuente de errores clásica):**

- `MetricSnapshot.capturedAt`, `TareaDiaria.fecha` y `CortePublicitario.fecha` son **marcas de día**: medianoche UTC del día de Ecuador. **Nunca se les restan 5 horas.**
- `ShopifyOrder.occurredAt`, `Requirement.date` y `EventoCalendario.inicio` son **instantes reales**. Para saber a qué día de Ecuador pertenecen se resta UTC−5.

**Atribución campaña → producto:** por el código al principio del nombre (`matchProduct` en `windsor-sync.ts`). También se aceptan los `codigosAnteriores` de un producto fusionado y, si no hay código, el nombre más largo que coincida. Una asignación manual (`productManual`) no se pisa nunca.

### 3.6 Mapa de carpetas

```
docs/                       esta documentación
prisma/
  schema.prisma             el modelo de datos (58 tablas, multi-organización)
  manual-sql/               cambios de esquema aplicados en producción, fechados
  seed.ts                   datos de ejemplo
tests/                      pruebas de regresión (npm test)
src/
  middleware.ts             redirecciones de sesión + anti-CSRF de la API
  instrumentation.ts        arranca el reloj; registro central de errores
  app/
    login/, cambiar-clave/  acceso
    dashboard/              una carpeta por pantalla del menú
      control/              control publicitario (Resultados, Economía, Enlazar)
      contenido/            calendario, día a día, requerimientos, lotes…
      _creativos/           componentes compartidos de piezas y requerimientos
      productos/[code]/     ficha del producto
      jarvis/               chat con el asistente
      …
    api/                    endpoints REST (89); cron/ = llamados por Railway
  lib/                      TODA la lógica de negocio (las pantallas solo llaman acá)
    db.ts                   cliente Prisma + cifrado transparente de tokens
    auth.ts, permissions.ts sesión y permisos
    scheduler.ts            el reloj de 5 minutos
    integrations/           Shopify, Windsor (Meta/TikTok), Notion, Meta/TikTok directos
    control-*.ts            control publicitario (control-calculo.ts = fórmulas puras)
    pedidos-reales.ts       pedidos de Shopify por día y producto
    economia.ts             calculadora: CPA de equilibrio y objetivo
    atribucion.ts           cruce órdenes reales vs atribuidas
    tarea-de-requerimiento.ts   pieza → tarea del tablero
    cifrado.ts, limite.ts, validacion.ts, http.ts, url-segura.ts   infraestructura
  generated/prisma/         cliente generado (no editar, no commitear)
```

---

## 4. Infraestructura y dominios

### 4.1 Dónde vive cada cosa

| Pieza | Proveedor | Detalle | Plan |
|---|---|---|---|
| Frontend + backend (Next.js) | **Railway** | Proyecto `importadora-bella-jarvis`, servicio `jarvis`, edge de Miami. Health check `/api/health`, reinicio automático. URL interna: `jarvis-production-0120.up.railway.app` | Verificar en el panel de Railway |
| Crons de respaldo | **Railway** | `cron-sync` (cada 15 min) y `cron-reporte-diario` (05:00 UTC) | Mismo proyecto |
| Base de datos | **Supabase** | Postgres 17, `us-east-1`, pooler de transacciones. 130 MB usados (septiembre de 2026). | **Free** (500 MB, sin backups automáticos) |
| Archivos (videos, imágenes) | **Google Drive** del equipo | Jarvis solo guarda los links | — |
| Correo saliente | **Resend** | Desde el dominio configurado en `EMAIL_FROM_DOMAIN` | Verificar |
| IA | **Anthropic** | Pago por uso | Pago por uso |
| Código | **GitHub** | `reditusconsultingholding-blip/ImportadoraBellaApp` | — |

### 4.2 Dominios y DNS

| Dominio | Registrador | DNS | Apunta a | Vence |
|---|---|---|---|---|
| `jarvisecom.com` | **Name.com** | Name.com (`ns1kpv/ns2cvx/ns3gnv/ns4fpy.name.com`) | Railway (dominio personalizado del servicio `jarvis`) | 2027-09-03 |
| `jarvisecom.world` | **Name.com** | Name.com | Estacionado en Name.com (sin uso). Pensado como dominio de envío de correo. | Verificar en Name.com |

No hay Cloudflare, Vercel, GoDaddy ni AWS en el camino. El certificado HTTPS lo emite y renueva Railway.

**Para cambiar el hosting**, en Name.com: actualizar el registro `CNAME` (o `A`) de `jarvisecom.com` hacia el nuevo proveedor y agregar el dominio en su panel.

**Activar la renovación automática** de ambos dominios en Name.com: si `jarvisecom.com` vence, la app deja de responder en esa dirección.

### 4.3 Recomendaciones de infraestructura

| Prioridad | Qué | Por qué |
|---|---|---|
| Alta | **Supabase Pro** (USD 25/mes) | El plan Free **no tiene backups automáticos**: un error o un borrado accidental no tiene vuelta atrás. Pro trae backups diarios con 7 días de retención. |
| Media | **Base de staging** (un segundo proyecto de Supabase o un branch) | Hoy desarrollo y producción comparten la base. |
| Media | **Monitor externo** de `/api/health` (UptimeRobot o Better Stack, gratis) | Que alguien se entere si la app o la sincronización se caen de noche. |
| Baja | **Redis** | No hace falta mientras la app corra en una sola instancia. Pasaría a ser necesario si Railway escala a varias réplicas (límites de frecuencia y caché de tokens compartidos). |

---

## 5. Rendimiento y seguimiento (septiembre de 2026)

**Memoria compartida** (`src/lib/memoria.ts`): los cálculos pesados de las pantallas se envuelven con `memorizar(nombre, fn)` y se comparten entre todo el equipo. Se vacía con **cualquier escritura** en la base (extensión en `db.ts`, salvo modelos que no mueven números: chat, voz, notificaciones, actividad, User). Cada lectura recibe una copia. Al terminar cada sync, `precalentar.ts` deja calculadas las vistas por defecto.
- Una función de lectura nueva y pesada: envolverla con `memorizar`, con argumentos serializables.
- Un modelo nuevo que no afecte ningún número: sumarlo a `SIN_EFECTO_EN_NUMEROS` en `db.ts`.
- Para depurar sin memoria: `MEMORIA_APAGADA=1`.

**Respuestas de API**: las GET grandes usan `jsonComprimido` (`src/lib/respuesta.ts`, gzip + no-store). Los errores hacia la pantalla pasan por `mensajeSeguro`.

**Medir en una máquina**: `next build` y después `RELOJ_APAGADO=1 PERFIL_CONSULTAS=1 next start`. El reloj queda apagado (no sincroniza contra producción) y cada consulta se escribe con su duración. `/api/health` informa `latenciaBaseMs`, la distancia servidor→base.

**Seguimiento de actividad** (`src/lib/actividad.ts`, tabla `ActividadUsuario`): el middleware marca cada pedido (`x-jarvis-*`) y `getSession` lo registra. Las búsquedas las manda `registro-busquedas.tsx`. La lectura (`/api/actividad`) es solo para OWNER. Los textos legibles salen de `actividad-texto.ts`: al agregar un endpoint que modifica datos, sumarle su frase en `ACCIONES`. Retención: 90 días.

## 6. Cómo seguir

- **Antes de tocar una fórmula del control:** `npm test`. Si cambias un número a propósito, actualiza la prueba y explica el porqué en `docs/DECISIONES.md`.
- **Antes de agregar una ruta de API:** sesión (`getSession`), permiso (`src/lib/permissions.ts`), cuerpo validado (`leerCuerpo` con Zod) y, si cuesta plata o prueba claves, `frenarUsuario`.
- **Antes de agregar un campo que guarde un secreto:** sumarlo a `SECRETOS` en `src/lib/db.ts` y a `TABLAS` en `src/lib/cifrado-repaso.ts`.
- **Antes de llamar a una API externa:** usar `fetchConReintentos` (`src/lib/http.ts`).
